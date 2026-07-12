#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
DB 스키마 정합성 점검 — 코드가 기대하는 테이블/제약이 실제 DB에 있는지 검증.

"조용한 실패" 방지용. 코드는 테이블/제약이 있다고 가정하는데 DB에 없으면
insert/upsert가 조용히 실패하고 아무도 모른다 (mau_tracking, funnel_events,
training_data, anonymous_ai_metadata가 전부 이 유형이었음).

사용법:
  python3 scripts/db-schema-check.py          # 1회 점검, 실패 시 exit 1
  배포 전/후, 크론(하루 1회)으로 돌리면 새 지뢰를 즉시 발견.

동작:
  1. 두 서버 + 앱 소스에서 .from("table") 과 onConflict:"cols" 를 전부 추출
  2. 각 테이블이 REST로 조회되는지 (404면 없음)
  3. 각 onConflict가 merge-duplicates sentinel 프로브로 제약 존재 확인 (42P10이면 없음)
"""
import os
import re
import sys
import json
import glob
import urllib.request
import urllib.error

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ENV = {}
with open(os.path.join(ROOT, ".stats.env")) as f:
    for line in f:
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            ENV[k] = v

SUPA = ENV["SUPABASE_URL"] + "/rest/v1"
H = {
    "apikey": ENV["SUPABASE_SERVICE_KEY"],
    "Authorization": "Bearer " + ENV["SUPABASE_SERVICE_KEY"],
    "Content-Type": "application/json",
}

# 스캔 대상 소스 디렉터리 (환경에 맞게 조정)
SCAN_DIRS = [
    os.path.join(ROOT, "src", "services"),
    os.path.expanduser("~/Projects/artlink-server/api"),
    os.path.expanduser("~/Projects/artlinknote/server/api"),
    os.path.expanduser("~/Projects/artlinknote/server/lib"),
]

# onConflict 프로브에 넣을 최소 sentinel payload (테이블별 NOT NULL 컬럼 충족용)
SENTINELS = {
    "growth_vectors": {"user_id": "00000000-0000-0000-0000-0000000000ff", "field": "__probe__", "vector": [], "potential_score": 0},
    "postings": {"source_url": "__probe_sentinel__", "title": "probe", "source": "__probe__", "field": "etc"},
    "mau_tracking": {"device_id": "__probe__", "month": "1999-01"},
    "funnel_events": {"device_id": "__probe__", "event": "new_open"},
    "training_data": {"content_hash": "__probe__", "field": "etc", "note_content": "x", "ai_feedback": "x"},
    # 42P10(제약없음)만 실패로 판정. 다른 에러(타입 등)는 제약이 있다는 증거이므로 payload가 완벽할 필요 없음.
    "artist_profiles": {"user_id": "00000000-0000-0000-0000-0000000000ff"},
    "raw_training_content": {"source_url": "__probe_sentinel__", "content": "x", "source": "__probe__"},
    "user_notes": {"auth_user_id": "00000000-0000-0000-0000-0000000000ff", "local_id": "__probe__"},
}


def req(method, path, body=None, extra_headers=None):
    h = dict(H)
    if extra_headers:
        h.update(extra_headers)
    r = urllib.request.Request(SUPA + path, method=method,
                               data=json.dumps(body).encode() if body else None, headers=h)
    try:
        with urllib.request.urlopen(r) as resp:
            return resp.status, resp.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()


def scan_code():
    tables, conflicts = set(), {}
    files = []
    for d in SCAN_DIRS:
        files += glob.glob(os.path.join(d, "**", "*.js"), recursive=True)
    for fp in files:
        if "node_modules" in fp:
            continue
        try:
            txt = open(fp, encoding="utf-8").read()
        except Exception:
            continue
        for m in re.finditer(r"""\.from\(['"]([a-z_]+)['"]\)""", txt):
            tables.add(m.group(1))
        for m in re.finditer(r"""onConflict:\s*['"]([a-z_,]+)['"]""", txt):
            # 어느 테이블의 onConflict인지 근처 .from() 으로 추정
            start = max(0, m.start() - 600)
            near = txt[start:m.start()]
            fm = re.findall(r"""\.from\(['"]([a-z_]+)['"]\)""", near)
            tbl = fm[-1] if fm else "?"
            conflicts[(tbl, m.group(1))] = fp
    return tables, conflicts


def main():
    tables, conflicts = scan_code()
    problems = []

    print("=== ① 테이블 존재 확인 (%d개) ===" % len(tables))
    for t in sorted(tables):
        code, _ = req("HEAD", f"/{t}?select=id&limit=1")
        # HEAD가 막히면 GET으로
        if code == 405:
            code, _ = req("GET", f"/{t}?select=id&limit=1")
        if code == 404:
            print(f"  ❌ {t}  ← 테이블 없음")
            problems.append(f"missing table: {t}")
        else:
            print(f"  ✅ {t}")

    print("\n=== ② onConflict 제약 확인 (%d개) ===" % len(conflicts))
    for (tbl, cols), fp in sorted(conflicts.items()):
        payload = SENTINELS.get(tbl)
        if not payload:
            print(f"  ❓ {tbl} ({cols}) — sentinel 미정의, 수동확인 필요 [{os.path.basename(fp)}]")
            continue
        code, body = req("POST", f"/{tbl}?on_conflict={cols}", payload,
                         {"Prefer": "resolution=merge-duplicates,return=minimal"})
        if "42P10" in body or "no unique or exclusion" in body:
            print(f"  ❌ {tbl} ({cols})  ← 제약 없음! upsert 조용히 실패함")
            problems.append(f"missing constraint: {tbl} ({cols})")
        else:
            print(f"  ✅ {tbl} ({cols})")
        # sentinel 정리
        first_col = cols.split(",")[0]
        val = payload.get(first_col)
        if val is not None:
            req("DELETE", f"/{tbl}?{first_col}=eq.{urllib.parse.quote(str(val))}")

    print("\n" + "=" * 50)
    if problems:
        print("❌ 스키마 불일치 %d건 — 조용한 실패 위험:" % len(problems))
        for p in problems:
            print("   -", p)
        sys.exit(1)
    print("✅ 코드와 DB 스키마 일치 — 조용한 실패 지뢰 없음")


if __name__ == "__main__":
    import urllib.parse
    main()
