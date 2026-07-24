#!/usr/bin/env python3
"""
번들 ID(com.00MM.artlink)에 Push Notifications capability를 켠다.
expo-notifications 도입으로 aps-environment 엔타이틀먼트가 필요해졌는데
기존 프로비저닝 프로파일에 푸시 기능이 없어 iOS 빌드가 실패한 것의 해결책.
자격증명은 .stats.env 에서 로드. 사용: /usr/bin/python3 scripts/asc-enable-push.py
"""
import os, time, sys
import jwt, requests

BASE = "https://api.appstoreconnect.apple.com"
BUNDLE = "com.00MM.artlink"

def load_env(path=".stats.env"):
    env = {}
    for line in open(path):
        line = line.strip()
        if "=" in line and not line.startswith("#"):
            k, v = line.split("=", 1)
            env[k] = v.strip().strip('"')
    return env

env = load_env()
key = open(os.path.expanduser(env["ASC_KEY_PATH"])).read()
now = int(time.time())
tok = jwt.encode(
    {"iss": env["ASC_ISSUER_ID"], "iat": now, "exp": now + 1100, "aud": "appstoreconnect-v1"},
    key, algorithm="ES256", headers={"kid": env["ASC_KEY_ID"], "typ": "JWT"},
)
H = {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}

r = requests.get(f"{BASE}/v1/bundleIds", headers=H,
                 params={"filter[identifier]": BUNDLE, "limit": 10})
data = [b for b in r.json().get("data", []) if b["attributes"]["identifier"] == BUNDLE]
if not data:
    print("번들 ID 못 찾음:", r.status_code, r.text[:300]); sys.exit(1)
bid = data[0]["id"]
print(f"번들 ID: {bid} ({data[0]['attributes']['name']})")

rc = requests.get(f"{BASE}/v1/bundleIds/{bid}/bundleIdCapabilities", headers=H, params={"limit": 50})
caps = [c["attributes"]["capabilityType"] for c in rc.json().get("data", [])]
print("현재 capabilities:", caps)
if "PUSH_NOTIFICATIONS" in caps:
    print("이미 켜져 있음 — 할 일 없음"); sys.exit(0)

rp = requests.post(f"{BASE}/v1/bundleIdCapabilities", headers=H, json={"data": {
    "type": "bundleIdCapabilities",
    "attributes": {"capabilityType": "PUSH_NOTIFICATIONS"},
    "relationships": {"bundleId": {"data": {"type": "bundleIds", "id": bid}}},
}})
if rp.status_code < 300:
    print("✅ PUSH_NOTIFICATIONS 켜짐")
else:
    print("✗ 실패:", rp.status_code, rp.text[:500]); sys.exit(2)
