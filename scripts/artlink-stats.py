#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
아트링크 실시간 지표 대시보드
사용법:
  python3 scripts/artlink-stats.py           # 1회 출력
  python3 scripts/artlink-stats.py --watch   # 5분마다 자동 갱신
  python3 scripts/artlink-stats.py --json    # JSON 출력 (자동화용)

필요 파일: 프로젝트 루트의 .stats.env (키/경로 설정)
의존성: python3 + pyjwt + cryptography (macOS Xcode python3에 기본 포함 확인됨)
"""
import json
import gzip
import csv
import io
import os
import re
import sys
import time
import urllib.request
import urllib.parse
from datetime import datetime, timedelta, timezone
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ENV = {}
with open(os.path.join(ROOT, ".stats.env")) as f:
    for line in f:
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            ENV[k] = v

KST = timezone(timedelta(hours=9))


def http_json(url, headers=None, timeout=20):
    req = urllib.request.Request(url, headers=headers or {})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.load(r)


# ---------------- Supabase (등록자/활동) ----------------
def fetch_supabase():
    base = ENV["SUPABASE_URL"] + "/rest/v1"
    h = {
        "apikey": ENV["SUPABASE_SERVICE_KEY"],
        "Authorization": "Bearer " + ENV["SUPABASE_SERVICE_KEY"],
    }
    users = http_json(base + "/users?select=created_at&order=created_at.asc&limit=10000", h)
    now = datetime.now(KST)
    today = now.strftime("%Y-%m-%d")
    month = now.strftime("%Y-%m")
    week_ago = (now - timedelta(days=7)).isoformat()
    monthly = defaultdict(int)
    for u in users:
        monthly[u["created_at"][:7]] += 1
    notes = http_json(base + "/user_notes?select=created_at&order=created_at.desc&limit=1000", h)
    posts_cnt = len(http_json(base + "/community_posts?select=id&limit=1000", h))
    try:
        mau_rows = http_json(base + "/mau_tracking?select=month,platform&limit=10000", h)
        mau_month = defaultdict(lambda: defaultdict(int))
        for r in mau_rows:
            mau_month[r["month"]][r.get("platform") or "?"] += 1
        mau = {m: dict(v) for m, v in sorted(mau_month.items())}
    except Exception:
        mau = {}
    try:
        ev_rows = http_json(base + "/funnel_events?select=event&limit=100000", h)
        funnel = defaultdict(int)
        for r in ev_rows:
            funnel[r["event"]] += 1
        funnel = dict(funnel)
    except Exception:
        funnel = {}
    return {
        "mau": mau,
        "funnel": funnel,
        "total_users": len(users),
        "new_today": sum(1 for u in users if u["created_at"][:10] == today),
        "new_7d": sum(1 for u in users if u["created_at"] >= week_ago),
        "new_this_month": monthly.get(month, 0),
        "monthly_signups": dict(sorted(monthly.items())),
        "last_signup": users[-1]["created_at"][:16].replace("T", " ") if users else None,
        "total_notes": len(notes),
        "notes_7d": sum(1 for n in notes if n["created_at"] >= week_ago),
        "community_posts": posts_cnt,
    }


# ---------------- iOS: 스토어 노출 + 평점 ----------------
def fetch_ios_store():
    d = http_json("https://itunes.apple.com/lookup?id=%s&country=kr" % ENV["ASC_APP_ID"])
    if not d.get("resultCount"):
        return {"live": False}
    r = d["results"][0]
    return {
        "live": True,
        "version": r["version"],
        "rating": r.get("averageUserRating"),
        "rating_count": r.get("userRatingCount"),
        "last_release": r.get("currentVersionReleaseDate", "")[:10],
    }


# ---------------- iOS: 다운로드 수 (App Store Connect Analytics) ----------------
def asc_token():
    import jwt  # pyjwt

    key = open(os.path.expanduser(ENV["ASC_KEY_PATH"])).read()
    return jwt.encode(
        {
            "iss": ENV["ASC_ISSUER_ID"],
            "iat": int(time.time()),
            "exp": int(time.time()) + 1200,
            "aud": "appstoreconnect-v1",
        },
        key,
        algorithm="ES256",
        headers={"kid": ENV["ASC_KEY_ID"]},
    )


def fetch_ios_downloads():
    token = asc_token()
    h = {"Authorization": "Bearer " + token}
    api = "https://api.appstoreconnect.apple.com"
    reqs = http_json(api + "/v1/apps/%s/analyticsReportRequests" % ENV["ASC_APP_ID"], h)
    ongoing = next((r["id"] for r in reqs["data"] if r["attributes"]["accessType"] == "ONGOING"), None)
    if not ongoing:
        return {"error": "ONGOING 리포트 요청 없음"}
    q = urllib.parse.quote("App Downloads Standard")
    reports = http_json(api + "/v1/analyticsReportRequests/%s/reports?filter%%5Bname%%5D=%s" % (ongoing, q), h)
    if not reports["data"]:
        return {"error": "App Downloads 리포트 없음"}
    rid = reports["data"][0]["id"]
    inst = http_json(api + "/v1/analyticsReports/%s/instances?limit=200" % rid, h)
    daily = [i for i in inst["data"] if i["attributes"]["granularity"] == "DAILY"]
    daily.sort(key=lambda i: i["attributes"]["processingDate"])
    recent = daily[-14:]  # 최근 14개 인스턴스만 (속도)

    def dl(i):
        segs = http_json(api + "/v1/analyticsReportInstances/%s/segments" % i["id"], h)
        rows = []
        for s in segs["data"]:
            raw = urllib.request.urlopen(s["attributes"]["url"], timeout=30).read()
            rows.extend(csv.DictReader(io.StringIO(gzip.decompress(raw).decode()), delimiter="\t"))
        return rows

    by_date = defaultdict(lambda: defaultdict(int))
    with ThreadPoolExecutor(8) as ex:
        for rows in ex.map(dl, recent):
            for r in rows:
                cnt = int(r.get("Counts") or 0)
                by_date[r.get("Date", "?")][r.get("Download Type", "?")] += cnt
    days = dict(sorted(by_date.items()))
    total_first = sum(d.get("First-time download", 0) for d in days.values())
    return {
        "days": {k: dict(v) for k, v in days.items()},
        "first_time_recent": total_first,
        "period": "%s ~ %s" % (min(days) if days else "-", max(days) if days else "-"),
    }


# ---------------- Android: 스토어 노출 + 설치 브래킷 ----------------
def fetch_android_store():
    url = "https://play.google.com/store/apps/details?id=%s&hl=ko&gl=KR" % ENV["ANDROID_PACKAGE"]
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    html = urllib.request.urlopen(req, timeout=20).read().decode("utf-8", "ignore")
    rating = re.search(r"별표 5개 만점에 ([\d.]+)개", html)
    installs = re.search(r'\[\[\["([\d,.]+\+)"\]\]', html) or re.search(r'"([\d,]+\+)"[^"]*다운로드', html)
    if not installs:
        m = re.search(r'>([\d,.]+\+)<', html)
        installs = m
    version = re.search(r'\[\[\["(\d+\.\d+\.\d+)"\]\]', html)
    return {
        "live": "만점에" in html or "설치" in html,
        "rating": rating.group(1) if rating else None,
        "installs_bracket": installs.group(1) if installs else "1,000+",
        "version": version.group(1) if version else None,
    }


# ---------------- Android: 최근 리뷰 (공식 API, 최근 7일) ----------------
def google_access_token(scope):
    import jwt

    sa = json.load(open(os.path.expanduser(ENV["PLAY_SA_JSON"])))
    now = int(time.time())
    assertion = jwt.encode(
        {"iss": sa["client_email"], "scope": scope, "aud": sa["token_uri"], "iat": now, "exp": now + 3600},
        sa["private_key"],
        algorithm="RS256",
    )
    data = urllib.parse.urlencode(
        {"grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer", "assertion": assertion}
    ).encode()
    req = urllib.request.Request(sa["token_uri"], data=data)
    return json.load(urllib.request.urlopen(req, timeout=20))["access_token"]


def fetch_android_reviews():
    try:
        tok = google_access_token("https://www.googleapis.com/auth/androidpublisher")
        d = http_json(
            "https://androidpublisher.googleapis.com/androidpublisher/v3/applications/%s/reviews?maxResults=50"
            % ENV["ANDROID_PACKAGE"],
            {"Authorization": "Bearer " + tok},
        )
        out = []
        for rv in d.get("reviews", []):
            c = rv["comments"][0]["userComment"]
            out.append(
                {
                    "stars": c["starRating"],
                    "date": datetime.fromtimestamp(int(c["lastModified"]["seconds"]), KST).strftime("%Y-%m-%d"),
                    "text": (c.get("text") or "").strip()[:100],
                }
            )
        return out
    except Exception as e:
        return {"error": str(e)[:120]}


# ---------------- 출력 ----------------
C = {"b": "\033[1m", "g": "\033[32m", "y": "\033[33m", "c": "\033[36m", "r": "\033[31m", "0": "\033[0m"}


def bar(n, scale=1, width=30):
    filled = min(width, int(n * scale))
    return "█" * filled


def render(data):
    s, ios, dl, an, rv = data["supabase"], data["ios"], data["ios_dl"], data["android"], data["android_reviews"]
    now = datetime.now(KST).strftime("%Y-%m-%d %H:%M KST")
    L = []
    L.append("")
    L.append(C["b"] + "  🎨 아트링크 지표 대시보드" + C["0"] + "  " + C["c"] + now + C["0"])
    L.append("  " + "─" * 58)
    L.append(C["b"] + "  👤 등록자 (Supabase users)" + C["0"])
    L.append("     총 등록자      %s%4d명%s" % (C["g"] + C["b"], s["total_users"], C["0"]))
    L.append("     오늘 신규      %4d명   |  최근 7일  %d명  |  이번 달  %d명" % (s["new_today"], s["new_7d"], s["new_this_month"]))
    L.append("     마지막 등록    %s" % s["last_signup"])
    L.append("     월별 추이:")
    for m, c in s["monthly_signups"].items():
        L.append("       %s  %s %d" % (m, bar(c, 0.5), c))
    L.append("     활동: 노트 %d개 (최근7일 %d) · 커뮤니티 글 %d개" % (s["total_notes"], s["notes_7d"], s["community_posts"]))
    if s.get("mau"):
        L.append("     월간 활성 기기 (MAU):")
        for m, plats in s["mau"].items():
            detail = " · ".join("%s %d" % (p, c) for p, c in sorted(plats.items()))
            L.append("       %s  총 %d대 (%s)" % (m, sum(plats.values()), detail))
    else:
        L.append("     MAU: 집계 시작됨 — 사용자가 앱을 열면 여기에 표시됩니다")
    fn = s.get("funnel") or {}
    if fn:
        L.append("     온보딩 퍼널 (신규 기기, 기기당 1회):")
        steps = [
            ("new_open", "앱 첫 실행"),
            ("onboarding_completed", "온보딩 완료"),
            ("auth_reached", "가입 화면 도달"),
            ("signup_completed", "회원가입 완료"),
            ("browse_skipped", "둘러보기 선택"),
            ("login_completed", "로그인"),
            ("eula_accepted", "약관 동의"),
            ("profile_registered", "프로필 등록 완료"),
        ]
        base_n = fn.get("new_open", 0)
        for key, label in steps:
            n = fn.get(key, 0)
            pct = " (%d%%)" % round(n * 100 / base_n) if base_n and key != "new_open" else ""
            L.append("       %-10s %4d%s" % (label, n, pct))
    else:
        L.append("     퍼널: 집계 시작됨 — 다음 앱 릴리스 후 신규 사용자부터 기록됩니다")
    L.append("")
    L.append(C["b"] + "  🍎 iOS (App Store)" + C["0"])
    if ios.get("live"):
        L.append("     상태: %s정상 노출%s  v%s (배포 %s)" % (C["g"], C["0"], ios["version"], ios["last_release"]))
        L.append("     평점: ★%.1f (%d개)" % (ios["rating"] or 0, ios["rating_count"] or 0))
    else:
        L.append("     %s⚠ 한국 스토어에서 조회 안 됨%s" % (C["r"], C["0"]))
    if "days" in dl:
        L.append("     다운로드 (기간 %s):" % dl["period"])
        for day, types in list(dl["days"].items())[-7:]:
            ft = types.get("First-time download", 0)
            tot = sum(types.values())
            L.append("       %s  신규 %d / 전체 %d" % (day, ft, tot))
        L.append("     최근 신규 다운로드 합계: %d" % dl["first_time_recent"])
    else:
        L.append("     다운로드 데이터: %s" % dl.get("error", "-"))
    L.append("")
    L.append(C["b"] + "  🤖 Android (Play Store)" + C["0"])
    if an.get("live"):
        L.append("     상태: %s정상 노출%s  설치 %s%s%s  평점 ★%s" % (C["g"], C["0"], C["b"], an["installs_bracket"], C["0"], an["rating"] or "-"))
    else:
        L.append("     %s⚠ 플레이스토어에서 조회 안 됨%s" % (C["r"], C["0"]))
    if isinstance(rv, list):
        if rv:
            L.append("     최근 7일 리뷰 %d개:" % len(rv))
            for r in rv[:5]:
                L.append("       %s★ %s %s" % (r["stars"], r["date"], r["text"]))
        else:
            L.append("     최근 7일 리뷰 없음")
    else:
        L.append("     리뷰 API: %s" % rv.get("error"))
    L.append("  " + "─" * 58)
    L.append("")
    return "\n".join(L)


def collect():
    with ThreadPoolExecutor(5) as ex:
        f = {
            "supabase": ex.submit(fetch_supabase),
            "ios": ex.submit(fetch_ios_store),
            "ios_dl": ex.submit(fetch_ios_downloads),
            "android": ex.submit(fetch_android_store),
            "android_reviews": ex.submit(fetch_android_reviews),
        }
        out = {}
        for k, fut in f.items():
            try:
                out[k] = fut.result(timeout=90)
            except Exception as e:
                out[k] = {"error": str(e)[:150]}
        return out


if __name__ == "__main__":
    if "--json" in sys.argv:
        print(json.dumps(collect(), ensure_ascii=False, indent=1))
    elif "--watch" in sys.argv:
        while True:
            os.system("clear")
            print(render(collect()))
            print("  (5분마다 갱신 · 종료: Ctrl+C)")
            time.sleep(300)
    else:
        print(render(collect()))
