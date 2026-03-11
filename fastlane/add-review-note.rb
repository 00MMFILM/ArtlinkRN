require "jwt"
require "net/http"
require "json"
require "uri"
require "openssl"

key_id = "3668ZJUQVP"
issuer_id = "a56a8823-d600-423b-88ba-15d0dc92a2a0"
key_path = "/Users/leechangyeop/.private_keys/AuthKey_3668ZJUQVP.p8"
app_id = "6752890224"
version_id = "cad4cff9-b76d-4eca-9939-8d578f02a762"

key = OpenSSL::PKey::EC.new(File.read(key_path))
payload = { iss: issuer_id, iat: Time.now.to_i, exp: Time.now.to_i + 1200, aud: "appstoreconnect-v1" }
token = JWT.encode(payload, key, "ES256", { kid: key_id })

def asc(method, path, token, body = nil)
  uri = URI("https://api.appstoreconnect.apple.com/v1/#{path}")
  http = Net::HTTP.new(uri.host, uri.port)
  http.use_ssl = true
  req = case method
        when :get then Net::HTTP::Get.new(uri)
        when :post then Net::HTTP::Post.new(uri)
        when :patch then Net::HTTP::Patch.new(uri)
        end
  req["Authorization"] = "Bearer #{token}"
  req["Content-Type"] = "application/json"
  req.body = body.to_json if body
  resp = http.request(req)
  parsed = begin; JSON.parse(resp.body); rescue; resp.body; end
  [resp.code.to_i, parsed]
end

# Check existing review detail
c, detail = asc(:get, "appStoreVersions/#{version_id}/appStoreReviewDetail", token)
puts "GET reviewDetail: #{c}"

if c == 200 && detail.is_a?(Hash) && detail["data"]
  detail_id = detail["data"]["id"]
  puts "Existing review detail found: #{detail_id}"
  puts "Current notes: #{detail["data"]["attributes"]["notes"]}"
else
  puts "No review detail, response: #{detail}"
end
