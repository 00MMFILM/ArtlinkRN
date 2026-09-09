#!/bin/zsh
# eas submit 래퍼 — 앱스토어 커넥트 키 식별자를 저장소 밖(~/.artlink-meta/asc.env)에서 읽어 넣는다.
# 사용: zsh scripts/eas-submit.sh ios|android
set -eu
[ -f "$HOME/.artlink-meta/asc.env" ] || { echo "[eas-submit] ~/.artlink-meta/asc.env 없음"; exit 1; }
set -a; source "$HOME/.artlink-meta/asc.env"; set +a
exec npx eas-cli submit --platform "${1:-ios}" --profile production --latest --non-interactive
