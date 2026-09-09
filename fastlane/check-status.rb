require "jwt"
require "net/http"
require "json"
require "uri"
require "openssl"
require_relative "asc_env"

key = OpenSSL::PKey::EC.new(File.read(KEY_PATH))
payload = { iss: ISSUER_ID, iat: Time.now.to_i, exp: Time.now.to_i + 1200, aud: "appstoreconnect-v1" }
token = JWT.encode(payload, key, "ES256", { kid: KEY_ID })

uri = URI("https://api.appstoreconnect.apple.com/v1/apps/#{APP_ID}/appStoreVersions?filter[platform]=IOS&limit=5")
http = Net::HTTP.new(uri.host, uri.port)
http.use_ssl = true
req = Net::HTTP::Get.new(uri)
req["Authorization"] = "Bearer #{token}"
req["Content-Type"] = "application/json"
resp = http.request(req)
data = JSON.parse(resp.body)

if data["data"]
  data["data"].each do |v|
    attrs = v["attributes"]
    puts "#{attrs["versionString"]} | #{attrs["appStoreState"]} | created: #{attrs["createdDate"]}"
  end
end
