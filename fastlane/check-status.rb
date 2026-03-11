require "jwt"
require "net/http"
require "json"
require "uri"
require "openssl"

key_id = "3668ZJUQVP"
issuer_id = "a56a8823-d600-423b-88ba-15d0dc92a2a0"
key_path = "/Users/leechangyeop/.private_keys/AuthKey_3668ZJUQVP.p8"
app_id = "6752890224"

key = OpenSSL::PKey::EC.new(File.read(key_path))
payload = { iss: issuer_id, iat: Time.now.to_i, exp: Time.now.to_i + 1200, aud: "appstoreconnect-v1" }
token = JWT.encode(payload, key, "ES256", { kid: key_id })

uri = URI("https://api.appstoreconnect.apple.com/v1/apps/#{app_id}/appStoreVersions?filter[platform]=IOS&limit=5")
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
