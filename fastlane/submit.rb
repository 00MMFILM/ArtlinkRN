require "jwt"
require "net/http"
require "json"
require "uri"
require "openssl"

key_id = "3668ZJUQVP"
issuer_id = "a56a8823-d600-423b-88ba-15d0dc92a2a0"
key_path = "/Users/leechangyeop/.private_keys/AuthKey_3668ZJUQVP.p8"
old_sub = "0419931c-a49b-4d79-b55d-6d3ad13a42a0"

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
        when :delete then Net::HTTP::Delete.new(uri)
        end
  req["Authorization"] = "Bearer #{token}"
  req["Content-Type"] = "application/json"
  req.body = body.to_json if body
  resp = http.request(req)
  parsed = begin; JSON.parse(resp.body); rescue; resp.body; end
  [resp.code.to_i, parsed]
end

# The old submission (UNRESOLVED_ISSUES) already has the version attached.
# Try to resubmit it directly by setting submitted: true
puts "--- Resubmitting old rejected submission ---"
c, result = asc(:patch, "reviewSubmissions/#{old_sub}", token, {
  data: {
    type: "reviewSubmissions",
    id: old_sub,
    attributes: { submitted: true }
  }
})
puts "PATCH: #{c}"
if result.is_a?(Hash) && result["data"]
  final = result["data"]["attributes"]["state"]
  puts final == "WAITING_FOR_REVIEW" ? "\n=== SUCCESS! SUBMITTED FOR REVIEW! ===" : "State: #{final}"
elsif result.is_a?(Hash)
  puts JSON.pretty_generate(result)
else
  puts result
end
