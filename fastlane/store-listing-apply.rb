# 앱스토어 해외 등록정보 반영 (2026-10-21)
# 배경: 플레이는 7/12부터 10개 언어였는데 앱스토어는 9개 로케일 전부 한국어 문구였다(API 실측).
# 흐름: VERSION 버전 확보(없으면 생성) → 로케일별 설명·키워드(appStoreVersionLocalizations) → 이름·부제(appInfoLocalizations)
# 사용: ruby store-listing-apply.rb [--dry]   (--dry: 쓰기 없이 계획만 출력)
# 입력: store-listing-i18n.json  — ko는 건드리지 않는다.
require "jwt"
require "net/http"
require "json"
require "uri"
require "openssl"
require_relative "asc_env"

VERSION = "1.11.13"
LISTING = JSON.parse(File.read(File.expand_path("store-listing-i18n.json", __dir__))).reject { |k, _| k.start_with?("_") }
DRY = ARGV.include?("--dry")

def token
  key = OpenSSL::PKey::EC.new(File.read(KEY_PATH))
  JWT.encode({ iss: ISSUER_ID, iat: Time.now.to_i, exp: Time.now.to_i + 1200, aud: "appstoreconnect-v1" }, key, "ES256", { kid: KEY_ID })
end

def asc(method, path, body = nil)
  uri = URI("https://api.appstoreconnect.apple.com/v1/#{path}")
  http = Net::HTTP.new(uri.host, uri.port); http.use_ssl = true
  req = { get: Net::HTTP::Get, post: Net::HTTP::Post, patch: Net::HTTP::Patch }[method].new(uri)
  req["Authorization"] = "Bearer #{token}"; req["Content-Type"] = "application/json"
  req.body = body.to_json if body
  resp = http.request(req)
  [resp.code.to_i, (JSON.parse(resp.body) rescue resp.body)]
end

def write(method, path, body, label)
  if DRY then puts "  (dry) #{method.to_s.upcase} #{path} — #{label}"; return end
  c, r = asc(method, path, body)
  ok = method == :post ? c == 201 : c == 200
  puts "  #{ok ? "OK" : "FAIL #{c}"} #{label}#{ok ? "" : " #{r.to_s[0, 300]}"}"
  abort("중단") unless ok
end

# 1) 버전 확보
c, r = asc(:get, "apps/#{APP_ID}/appStoreVersions?filter[platform]=IOS&limit=5")
abort("버전 조회 실패 #{c}") unless c == 200
ver = r["data"].find { |v| v["attributes"]["versionString"] == VERSION }
if ver
  vid = ver["id"]; puts "STEP1: #{VERSION} 재사용 (#{ver["attributes"]["appStoreState"]})"
elsif DRY
  puts "STEP1: (dry) #{VERSION} 버전 생성 예정"; vid = nil
else
  c, r = asc(:post, "appStoreVersions", { data: { type: "appStoreVersions", attributes: { platform: "IOS", versionString: VERSION },
    relationships: { app: { data: { type: "apps", id: APP_ID } } } } })
  abort("버전 생성 실패 #{c} #{r}") unless c == 201
  vid = r["data"]["id"]; puts "STEP1: #{VERSION} 생성"
end

# 2) 설명·키워드 (버전 로케일)
puts "STEP2: 설명·키워드 #{LISTING.size}개 로케일"
have = vid ? asc(:get, "appStoreVersions/#{vid}/appStoreVersionLocalizations?limit=50")[1]["data"].to_h { |l| [l["attributes"]["locale"], l] } : {}
LISTING.each do |loc, t|
  attrs = { description: t["description"], keywords: t["keywords"] }
  if (l = have[loc])
    cur = l["attributes"]
    next puts("  skip #{loc} 이미 같음") if cur["description"] == t["description"] && cur["keywords"] == t["keywords"]
    write(:patch, "appStoreVersionLocalizations/#{l["id"]}", { data: { type: "appStoreVersionLocalizations", id: l["id"], attributes: attrs } }, "#{loc} 수정")
  else
    attrs[:whatsNew] = have.values.first&.dig("attributes", "whatsNew") if have.any?
    write(:post, "appStoreVersionLocalizations", { data: { type: "appStoreVersionLocalizations", attributes: attrs.merge(locale: loc),
      relationships: { appStoreVersion: { data: { type: "appStoreVersions", id: vid } } } } }, "#{loc} 신설")
  end
end

# 3) 이름·부제 (appInfo 로케일 — 편집 가능한 appInfo = READY_FOR_SALE 아닌 쪽)
c, r = asc(:get, "apps/#{APP_ID}/appInfos")
infos = r["data"]
info = infos.find { |i| i["attributes"]["appStoreState"] != "READY_FOR_SALE" } || (DRY ? nil : abort("편집 가능한 appInfo 없음 — 버전 생성 뒤 다시"))
puts "STEP3: 이름·부제 (appInfo #{info ? info["attributes"]["appStoreState"] : "dry"})"
have = info ? asc(:get, "appInfos/#{info["id"]}/appInfoLocalizations?limit=50")[1]["data"].to_h { |l| [l["attributes"]["locale"], l] } : {}
LISTING.each do |loc, t|
  attrs = { name: t["name"], subtitle: t["subtitle"] }
  if (l = have[loc])
    cur = l["attributes"]
    next puts("  skip #{loc} 이미 같음") if cur["name"] == t["name"] && cur["subtitle"] == t["subtitle"]
    write(:patch, "appInfoLocalizations/#{l["id"]}", { data: { type: "appInfoLocalizations", id: l["id"], attributes: attrs } }, "#{loc} #{t["name"]} / #{t["subtitle"]}")
  else
    write(:post, "appInfoLocalizations", { data: { type: "appInfoLocalizations", attributes: attrs.merge(locale: loc),
      relationships: { appInfo: { data: { type: "appInfos", id: info && info["id"] } } } } }, "#{loc} 신설 #{t["name"]}")
  end
end
puts DRY ? "=== dry 끝 ===" : "=== 등록정보 반영 끝 — 빌드 연결·제출은 release-1_11_13.rb ==="
