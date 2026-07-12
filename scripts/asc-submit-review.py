#!/usr/bin/env python3
"""
App Store Connect 심사 제출 자동화.
eas submit 이 바이너리를 ASC에 올린 뒤, 이 스크립트가:
  1) 빌드가 처리 완료(VALID)될 때까지 대기
  2) 해당 마케팅 버전의 App Store 버전을 찾거나 생성
  3) 릴리스노트(whatsNew) 채우고, 빌드 연결, 수출규정(암호화 미사용) 처리
  4) reviewSubmission 생성 + 아이템 추가 + 제출
자격증명은 .stats.env 에서 로드(명령줄에 시크릿 노출 안 함).
사용: python3 scripts/asc-submit-review.py 1.10.11 59
"""
import sys, os, time, json
import jwt, requests

BASE = "https://api.appstoreconnect.apple.com"
NOTES = {
    "ko": "• 비움스튜디오 대본 연동 — 사이트에서 고른 대본이 연습 노트에 바로 담깁니다\n• 안정성 및 사용성 개선",
    "default": "• Script hand-off from partner sites — start a practice note with your monologue pre-filled\n• Stability and usability improvements",
}

def load_env(path=".stats.env"):
    env = {}
    for line in open(path):
        line = line.strip()
        if "=" in line and not line.startswith("#"):
            k, v = line.split("=", 1)
            env[k] = v.strip().strip('"')
    return env

def make_token(env):
    key = open(os.path.expanduser(env["ASC_KEY_PATH"])).read()
    now = int(time.time())
    return jwt.encode(
        {"iss": env["ASC_ISSUER_ID"], "iat": now, "exp": now + 1100, "aud": "appstoreconnect-v1"},
        key, algorithm="ES256", headers={"kid": env["ASC_KEY_ID"], "typ": "JWT"},
    )

def main():
    version_str = sys.argv[1] if len(sys.argv) > 1 else "1.10.11"
    build_num = sys.argv[2] if len(sys.argv) > 2 else "59"
    env = load_env()
    app_id = env["ASC_APP_ID"]
    tok = make_token(env)
    H = {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}

    def refresh():
        nonlocal tok, H
        tok = make_token(env)
        H = {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}

    # ── 1) 빌드 처리 완료 대기 ──
    print(f"[1] 빌드 {version_str}({build_num}) 처리 상태 대기...", flush=True)
    build_id = None
    deadline = time.time() + 25 * 60
    while time.time() < deadline:
        refresh()
        r = requests.get(f"{BASE}/v1/builds", headers=H, params={
            "filter[app]": app_id, "filter[version]": build_num,
            "filter[preReleaseVersion.version]": version_str,
            "include": "preReleaseVersion", "limit": 5,
        })
        data = r.json().get("data", [])
        if data:
            b = data[0]
            state = b["attributes"].get("processingState")
            build_id = b["id"]
            print(f"    build {build_id[:8]} state={state}", flush=True)
            if state == "VALID":
                break
            if state in ("INVALID", "FAILED"):
                print(f"    빌드 처리 실패: {state}"); sys.exit(2)
        else:
            print("    아직 빌드가 ASC에 안 보임(업로드 처리중)...", flush=True)
        time.sleep(30)
    if not build_id:
        print("    타임아웃: 빌드가 처리되지 않음"); sys.exit(2)
    print(f"    ✓ 빌드 VALID: {build_id}", flush=True)

    # ── 2) App Store 버전 찾기/생성 ──
    refresh()
    r = requests.get(f"{BASE}/v1/apps/{app_id}/appStoreVersions", headers=H, params={
        "filter[versionString]": version_str, "filter[platform]": "IOS", "limit": 5,
    })
    versions = r.json().get("data", [])
    editable = [v for v in versions if v["attributes"].get("appStoreState") in (
        "PREPARE_FOR_SUBMISSION", "DEVELOPER_REJECTED", "REJECTED", "METADATA_REJECTED",
    )]
    if editable:
        ver_id = editable[0]["id"]
        print(f"[2] 기존 편집가능 버전 사용: {ver_id} ({editable[0]['attributes']['appStoreState']})", flush=True)
    elif versions:
        ver_id = versions[0]["id"]
        print(f"[2] 기존 버전 사용(상태 {versions[0]['attributes']['appStoreState']}): {ver_id}", flush=True)
    else:
        r = requests.post(f"{BASE}/v1/appStoreVersions", headers=H, json={"data": {
            "type": "appStoreVersions",
            "attributes": {"platform": "IOS", "versionString": version_str},
            "relationships": {"app": {"data": {"type": "apps", "id": app_id}}},
        }})
        if r.status_code >= 300:
            print("    버전 생성 실패:", r.status_code, r.text[:500]); sys.exit(3)
        ver_id = r.json()["data"]["id"]
        print(f"[2] 새 버전 생성: {ver_id}", flush=True)

    # ── 3) 릴리스노트 채우기 ──
    refresh()
    r = requests.get(f"{BASE}/v1/appStoreVersions/{ver_id}/appStoreVersionLocalizations", headers=H, params={"limit": 50})
    locs = r.json().get("data", [])
    for loc in locs:
        locale = loc["attributes"].get("locale", "")
        note = NOTES.get(locale.split("-")[0], NOTES["default"])
        pr = requests.patch(f"{BASE}/v1/appStoreVersionLocalizations/{loc['id']}", headers=H, json={"data": {
            "type": "appStoreVersionLocalizations", "id": loc["id"],
            "attributes": {"whatsNew": note},
        }})
        print(f"    릴리스노트 {locale}: {'✓' if pr.status_code < 300 else '✗ '+str(pr.status_code)}", flush=True)

    # ── 4) 수출규정(암호화 미사용) 처리 ──
    refresh()
    requests.patch(f"{BASE}/v1/builds/{build_id}", headers=H, json={"data": {
        "type": "builds", "id": build_id, "attributes": {"usesNonExemptEncryption": False},
    }})

    # ── 5) 빌드 연결 ──
    r = requests.patch(f"{BASE}/v1/appStoreVersions/{ver_id}/relationships/build", headers=H, json={
        "data": {"type": "builds", "id": build_id},
    })
    print(f"[3] 빌드 연결: {'✓' if r.status_code < 300 else '✗ '+str(r.status_code)+' '+r.text[:300]}", flush=True)

    # ── 6) 리뷰 제출 ──
    refresh()
    r = requests.post(f"{BASE}/v1/reviewSubmissions", headers=H, json={"data": {
        "type": "reviewSubmissions", "attributes": {"platform": "IOS"},
        "relationships": {"app": {"data": {"type": "apps", "id": app_id}}},
    }})
    if r.status_code >= 300:
        # 이미 열린 제출이 있으면 재사용
        rr = requests.get(f"{BASE}/v1/reviewSubmissions", headers=H, params={
            "filter[app]": app_id, "filter[state]": "READY_FOR_REVIEW,WAITING_FOR_REVIEW,IN_REVIEW,UNRESOLVED_ISSUES", "limit": 5})
        opened = rr.json().get("data", [])
        if opened:
            sub_id = opened[0]["id"]
            print(f"[4] 기존 리뷰 제출 재사용: {sub_id} ({opened[0]['attributes'].get('state')})", flush=True)
        else:
            print("    리뷰 제출 생성 실패:", r.status_code, r.text[:500]); sys.exit(4)
    else:
        sub_id = r.json()["data"]["id"]
        print(f"[4] 리뷰 제출 생성: {sub_id}", flush=True)

    # 아이템 추가(버전 연결)
    ri = requests.post(f"{BASE}/v1/reviewSubmissionItems", headers=H, json={"data": {
        "type": "reviewSubmissionItems",
        "relationships": {
            "reviewSubmission": {"data": {"type": "reviewSubmissions", "id": sub_id}},
            "appStoreVersion": {"data": {"type": "appStoreVersions", "id": ver_id}},
        },
    }})
    print(f"    아이템 추가: {'✓' if ri.status_code < 300 else '✗ '+str(ri.status_code)+' '+ri.text[:300]}", flush=True)

    # 제출 확정
    refresh()
    rp = requests.patch(f"{BASE}/v1/reviewSubmissions/{sub_id}", headers=H, json={"data": {
        "type": "reviewSubmissions", "id": sub_id, "attributes": {"submitted": True},
    }})
    if rp.status_code < 300:
        print(f"[5] ✅ 심사 제출 완료! state={rp.json()['data']['attributes'].get('state')}", flush=True)
    else:
        print("[5] ✗ 제출 확정 실패:", rp.status_code, rp.text[:600], flush=True); sys.exit(5)

if __name__ == "__main__":
    main()
