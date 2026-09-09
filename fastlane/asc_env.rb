# 앱스토어 커넥트 식별자 로더.
# 이 저장소는 공개라 키ID·발급자ID·애플계정을 코드에 두지 않는다(2026-09-09).
# 값은 ~/.artlink-meta/asc.env (chmod 600)에 있고, 셸에서는
#   set -a; source ~/.artlink-meta/asc.env; set +a
# 로 같은 파일을 읽으면 된다(eas submit 이 EXPO_ASC_* 를 그대로 사용).
ASC_ENV_PATH = File.expand_path("~/.artlink-meta/asc.env")

if File.exist?(ASC_ENV_PATH)
  File.readlines(ASC_ENV_PATH).each do |line|
    line = line.strip
    next if line.empty? || line.start_with?("#")
    k, v = line.split("=", 2)
    ENV[k] ||= v.to_s.strip.gsub(/\A["']|["']\z/, "")
  end
end

def asc_env(name)
  ENV[name] or abort("[asc_env] #{name} 없음 — #{ASC_ENV_PATH} 를 확인해라")
end

KEY_ID    = asc_env("ASC_KEY_ID")
ISSUER_ID = asc_env("ASC_ISSUER_ID")
KEY_PATH  = asc_env("ASC_KEY_PATH")
APP_ID    = asc_env("ASC_APP_ID")
