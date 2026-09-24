# 1.11.7 심사 제출 전과정 (2026-09-24)
# 흐름: 버전 생성(없으면) → 빌드73 처리 대기 → 빌드 연결 → 8개 언어 whatsNew → reviewSubmission 생성·제출
require "jwt"
require "net/http"
require "json"
require "uri"
require "openssl"
require_relative "asc_env"

VERSION = "1.11.7"
BUILD_NUMBER = "85"
NOTES_PATH = "/private/tmp/claude-501/-Users-leechangyeop/7846a8ad-8bca-489f-b0ef-94b5d694327c/scratchpad/release-notes-1.11.7.json"

def token
  key = OpenSSL::PKey::EC.new(File.read(KEY_PATH))
  payload = { iss: ISSUER_ID, iat: Time.now.to_i, exp: Time.now.to_i + 1200, aud: "appstoreconnect-v1" }
  JWT.encode(payload, key, "ES256", { kid: KEY_ID })
end

def asc(method, path, body = nil)
  uri = URI("https://api.appstoreconnect.apple.com/v1/#{path}")
  http = Net::HTTP.new(uri.host, uri.port)
  http.use_ssl = true
  req = { get: Net::HTTP::Get, post: Net::HTTP::Post, patch: Net::HTTP::Patch }[method].new(uri)
  req["Authorization"] = "Bearer #{token}"
  req["Content-Type"] = "application/json"
  req.body = body.to_json if body
  resp = http.request(req)
  parsed = begin; JSON.parse(resp.body); rescue; resp.body; end
  [resp.code.to_i, parsed]
end

# 1) 1.10.18 버전 확보 (PREPARE_FOR_SUBMISSION 있으면 재사용)
c, r = asc(:get, "apps/#{APP_ID}/appStoreVersions?filter[platform]=IOS&limit=5")
abort("버전 조회 실패 #{c}") unless c == 200
existing = r["data"].find { |v| v["attributes"]["versionString"] == VERSION }
if existing
  vid = existing["id"]
  puts "STEP1: 기존 #{VERSION} 버전 재사용 (#{existing["attributes"]["appStoreState"]})"
else
  c, r = asc(:post, "appStoreVersions", {
    data: { type: "appStoreVersions",
            attributes: { platform: "IOS", versionString: VERSION },
            relationships: { app: { data: { type: "apps", id: APP_ID } } } } })
  abort("버전 생성 실패 #{c}: #{r}") unless c == 201
  vid = r["data"]["id"]
  puts "STEP1: #{VERSION} 버전 생성 완료 (#{vid})"
end

# 2) 빌드 73 처리 완료(VALID) 대기 — 최대 30분
build_id = nil
60.times do |i|
  c, r = asc(:get, "builds?filter[app]=#{APP_ID}&filter[version]=#{BUILD_NUMBER}&filter[preReleaseVersion.version]=#{VERSION}&limit=1")
  b = (c == 200) ? r["data"]&.first : nil
  st = b && b["attributes"]["processingState"]
  if st == "VALID"
    build_id = b["id"]
    puts "STEP2: 빌드 #{BUILD_NUMBER} VALID (#{build_id})"
    break
  elsif st == "INVALID" || st == "FAILED"
    abort("STEP2 실패: 빌드 처리 상태 #{st}")
  end
  puts "STEP2: 빌드 처리 대기중... (#{st || '미등장'}, #{i + 1}/60)"
  sleep 30
end
abort("STEP2 실패: 30분 내 빌드 VALID 안 됨") unless build_id

# 3) 버전에 빌드 연결
c, r = asc(:patch, "appStoreVersions/#{vid}", {
  data: { type: "appStoreVersions", id: vid,
          relationships: { build: { data: { type: "builds", id: build_id } } } } })
abort("STEP3 빌드 연결 실패 #{c}: #{r}") unless c == 200
puts "STEP3: 빌드 연결 완료"

# 4) 8개 언어 whatsNew (1.10.14 함정 방지 — 전부 채워야 제출 가능)
notes = JSON.parse(File.read(NOTES_PATH))
c, r = asc(:get, "appStoreVersions/#{vid}/appStoreVersionLocalizations?limit=20")
abort("STEP4 로컬라이제이션 조회 실패 #{c}") unless c == 200
filled = []
r["data"].each do |loc|
  lc = loc["attributes"]["locale"]
  text = notes[lc]
  next puts("STEP4 경고: #{lc} 노트 없음 — 건너뜀") unless text
  c2, r2 = asc(:patch, "appStoreVersionLocalizations/#{loc["id"]}", {
    data: { type: "appStoreVersionLocalizations", id: loc["id"],
            attributes: { whatsNew: text } } })
  c2 == 200 ? filled << lc : puts("STEP4 실패 #{lc}: #{c2} #{r2}")
end
puts "STEP4: whatsNew 채움 → #{filled.join(', ')}"
abort("STEP4 실패: 8개 언어 미충족 (#{filled.size})") if filled.size < 8

# 5) 심사 제출
c, r = asc(:post, "reviewSubmissions", {
  data: { type: "reviewSubmissions", attributes: { platform: "IOS" },
          relationships: { app: { data: { type: "apps", id: APP_ID } } } } })
abort("STEP5 reviewSubmission 생성 실패 #{c}: #{r}") unless c == 201
sub_id = r["data"]["id"]
c, r = asc(:post, "reviewSubmissionItems", {
  data: { type: "reviewSubmissionItems",
          relationships: {
            reviewSubmission: { data: { type: "reviewSubmissions", id: sub_id } },
            appStoreVersion: { data: { type: "appStoreVersions", id: vid } } } } })
abort("STEP5 item 연결 실패 #{c}: #{r}") unless c == 201
c, r = asc(:patch, "reviewSubmissions/#{sub_id}", {
  data: { type: "reviewSubmissions", id: sub_id, attributes: { submitted: true } } })
state = r.is_a?(Hash) && r.dig("data", "attributes", "state")
puts "STEP5: 제출 PATCH #{c}, state=#{state}"
puts(state == "WAITING_FOR_REVIEW" ? "=== SUCCESS: #{VERSION} 심사 제출 완료 ===" : "=== 확인 필요: #{state} ===")
