# 앱스토어 커넥트 자격 식별자

이 저장소는 공개다. 앱스토어 커넥트 키 ID·발급자 ID·애플 계정은 코드에 두지 않고
`~/.artlink-meta/asc.env` (chmod 600, 저장소 밖)에 둔다. 개인키 `.p8`은 `~/.private_keys/`에 있고 저장소에 없다.

## 항목
```
ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_PATH, ASC_APP_ID, APPLE_TEAM_ID, APPLE_ID
EXPO_ASC_KEY_ID, EXPO_ASC_ISSUER_ID, EXPO_ASC_API_KEY_PATH   # eas submit 용, 같은 값
```

## 쓰는 법
- 루비 스크립트(`check-status.rb`, `release-*.rb`, `submit.rb`, `Fastfile`, `Appfile`):
  `require_relative "asc_env"` 가 위 파일을 읽어 `KEY_ID`·`ISSUER_ID`·`KEY_PATH`·`APP_ID` 상수를 만든다. 값이 없으면 즉시 중단한다.
- `eas submit`: `zsh scripts/eas-submit.sh ios|android` 로 실행한다(래퍼가 env를 넣어준다).
  직접 실행하려면 `set -a; source ~/.artlink-meta/asc.env; set +a` 를 먼저 해라.

## 새 맥으로 옮길 때
`~/.artlink-meta/asc.env` 와 `~/.private_keys/AuthKey_*.p8` 두 개를 안전하게 복사하면 된다.
