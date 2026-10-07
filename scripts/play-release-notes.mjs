// 플레이 운영 트랙의 해당 빌드에 릴리즈노트를 넣는다(eas submit은 노트를 올리지 않는다).
// 사용: node scripts/play-release-notes.mjs <version> <versionCode>   예) 1.11.10 92
// 검증(validate)을 통과할 때만 반영하고, 실패하면 변경을 버린다.
import fs from "fs"; import crypto from "crypto";
const [version, code] = process.argv.slice(2);
if (!version || !code) { console.log("사용: play-release-notes.mjs <version> <versionCode>"); process.exit(1); }
const sa = JSON.parse(fs.readFileSync(new URL("../play-service-account.json", import.meta.url), "utf8"));
const b64 = (o) => Buffer.from(typeof o === "string" ? o : JSON.stringify(o)).toString("base64url");
const now = Math.floor(Date.now() / 1000);
const u = b64({ alg: "RS256", typ: "JWT" }) + "." + b64({ iss: sa.client_email, scope: "https://www.googleapis.com/auth/androidpublisher", aud: sa.token_uri, iat: now, exp: now + 3600 });
const sig = crypto.sign("RSA-SHA256", Buffer.from(u), sa.private_key).toString("base64url");
const tok = (await (await fetch(sa.token_uri, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: u + "." + sig }) })).json()).access_token;
const base = "https://androidpublisher.googleapis.com/androidpublisher/v3/applications/com.mm00.artlink";
const H = { Authorization: "Bearer " + tok, "Content-Type": "application/json" };
const j = async (m, p, b) => { const r = await fetch(base + p, { method: m, headers: H, body: b ? JSON.stringify(b) : undefined }); const t = await r.text(); return { s: r.status, d: t ? JSON.parse(t) : {} }; };
const notes = JSON.parse(fs.readFileSync(new URL(`../fastlane/notes/${version}.json`, import.meta.url), "utf8"));
const map = { ko: "ko-KR", "en-US": "en-US", ja: "ja-JP", "zh-Hans": "zh-CN", "zh-Hant": "zh-TW", th: "th", vi: "vi", id: "id" };
const e = (await j("POST", "/edits", {})).d;
if (!e.id) { console.log("edit 생성 실패"); process.exit(1); }
const langs = ((await j("GET", `/edits/${e.id}/listings`)).d.listings || []).map((l) => l.language);
const releaseNotes = Object.entries(notes).map(([k, text]) => ({ language: map[k], text })).filter((n) => langs.includes(n.language));
const tr = (await j("GET", `/edits/${e.id}/tracks/production`)).d;
const rel = (tr.releases || []).find((r) => (r.versionCodes || []).includes(String(code)));
if (!rel) { console.log(`운영 트랙에 ${code} 없음:`, (tr.releases || []).map((r) => `${r.name}:${r.status}:${r.versionCodes}`).join(" | ")); await j("DELETE", `/edits/${e.id}`); process.exit(1); }
rel.releaseNotes = releaseNotes;
const put = await j("PUT", `/edits/${e.id}/tracks/production`, { track: "production", releases: tr.releases });
const val = await j("POST", `/edits/${e.id}:validate`);
if (put.s !== 200 || val.s !== 200) { console.log("실패", put.s, val.s, JSON.stringify(val.d).slice(0, 300)); await j("DELETE", `/edits/${e.id}`); process.exit(1); }
const c = await j("POST", `/edits/${e.id}:commit`);
console.log(`반영 ${c.s} | ${rel.name} ${rel.status} [${rel.versionCodes}] | 노트 ${releaseNotes.map((n) => `${n.language}(${n.text.length})`).join(", ")}`);
