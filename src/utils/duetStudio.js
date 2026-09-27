import koreanCollection from "../data/duet-scenes.json";
import englishCollection from "../data/duet-scenes-en.json";
import { REHEARSAL_SCRIPT_LIMIT } from "./studioMetadata";

export const SCRIPT_LIMITS = { characters: 12000, lines: 120, lineCharacters: 1000, roleCharacters: 40 };
export const rehearsalLanguage = (language) => String(language || "").toLowerCase().startsWith("ko") ? "ko" : "en";
export const sceneLanguage = (scene) => scene?.language === "en" ? "en" : "ko";
export const voiceLanguage = (scene, englishVoice = "en-US") => sceneLanguage(scene) === "ko" ? "ko-KR" : (englishVoice === "en-GB" ? "en-GB" : "en-US");

const validString = (value, max) => typeof value === "string" && value.trim().length > 0 && value.length <= max;
export const isValidRemoteData = (data) => {
  if (!data || !Number.isFinite(data.version) || data.version < koreanCollection.version || !Array.isArray(data.scenes) || !data.scenes.length || data.scenes.length > 200) return false;
  const ids = new Set();
  return data.scenes.every((scene) => {
    if (!scene || !validString(scene.id, 100) || !/^[a-zA-Z0-9_-]+$/.test(scene.id) || ids.has(scene.id) || !validString(scene.play, 150)) return false;
    ids.add(scene.id);
    if (scene.language && scene.language !== "ko") return false;
    if (["author", "label", "point", "source"].some((key) => scene[key] != null && (typeof scene[key] !== "string" || scene[key].length > 4000))) return false;
    if (scene.descriptionTranslations != null) {
      if (typeof scene.descriptionTranslations !== "object" || Array.isArray(scene.descriptionTranslations)) return false;
      if (["ko", "en"].some((language) => ["label", "point"].some((key) => {
        const value = scene.descriptionTranslations[language]?.[key];
        return value != null && (typeof value !== "string" || value.length > 4000);
      }))) return false;
    }
    if (!Array.isArray(scene.roles) || scene.roles.length !== 2 || !scene.roles.every((role) => validString(role?.name, 80))) return false;
    if (!Array.isArray(scene.lines) || scene.lines.length < 2 || scene.lines.length > 200) return false;
    return scene.lines.every((line) => line && Number.isInteger(line.r) && line.r >= 0 && line.r < 2 && validString(line.t, 3000) && (line.d == null || typeof line.d === "string"));
  });
};

// The remote ACT RAW collection may refresh Korean scenes, never bundled English originals.
export const mergeDuetScenes = (remote) => {
  const originals = englishCollection.scenes;
  const protectedIds = new Set(originals.map((scene) => scene.id));
  const korean = isValidRemoteData(remote) ? remote.scenes : koreanCollection.scenes;
  return [...korean.filter((scene) => !protectedIds.has(scene.id)).map((scene) => ({ ...scene, language: "ko", source: scene.source || "ACT RAW · actraw.kr" })), ...originals];
};

export const sceneDescription = (scene, language, key) => {
  const value = scene?.descriptionTranslations?.[language]?.[key] || scene?.[key];
  return typeof value === "string" ? value : "";
};
export const sceneRightsKey = (scene) => scene?.isPrivate ? "rightsPrivate" : scene?.rights?.type === "artlink-original" ? "rightsOriginal" : "rightsSource";

// No script hash, text, role name, or title is sent to analytics; ids are random and local.
export const parsePrivateScript = (input, language = "en", createId = () => `private-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`) => {
  if (typeof input !== "string" || !input.trim()) return { error: "empty" };
  if (input.length > SCRIPT_LIMITS.characters) return { error: "tooLong" };
  const rows = input.replace(/\r\n?/g, "\n").split("\n");
  const roles = [];
  const lines = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i].trim();
    if (!row) continue;
    const match = row.match(/^([^:：]+)[:：]\s*(.*)$/u);
    if (!match || !match[2].trim()) return { error: "format", line: i + 1 };
    const name = match[1].trim();
    const text = match[2].trim();
    if (name.length > SCRIPT_LIMITS.roleCharacters || /[\[\]<>]/.test(name) || text.length > SCRIPT_LIMITS.lineCharacters) return { error: "format", line: i + 1 };
    let role = roles.findIndex((item) => item.name.toLocaleLowerCase() === name.toLocaleLowerCase());
    if (role === -1) { roles.push({ name, gender: "" }); role = roles.length - 1; }
    if (roles.length > 2) return { error: "twoRoles" };
    lines.push({ r: role, t: text });
    if (lines.length > SCRIPT_LIMITS.lines) return { error: "tooManyLines" };
  }
  if (roles.length !== 2 || lines.length < 2) return { error: "twoRoles" };
  return { scene: { id: createId(), play: language === "ko" ? "내 대본" : "My private script", language: rehearsalLanguage(language), author: "", genre: "", source: "private", rights: { type: "user-provided" }, isPrivate: true, roles, lines } };
};

// Speaker-labelled scene text for AI feedback. Over the limit, the user's lines are kept
// first and partner lines fill the rest; "…" marks omitted lines.
export const rehearsalScript = (scene, roleIndex, limit = REHEARSAL_SCRIPT_LIMIT) => {
  const rows = (scene?.lines || []).map((line) => ({
    mine: line.r === roleIndex,
    text: `${scene.roles?.[line.r]?.name || "?"}: ${line.d ? `(${line.d}) ` : ""}${String(line.t || "").trim()}`,
  }));
  const keep = new Set();
  let used = 0;
  for (const mine of [true, false]) rows.forEach((row, i) => {
    if (row.mine === mine && used + row.text.length + 2 <= limit) { keep.add(i); used += row.text.length + 2; }
  });
  const out = [];
  rows.forEach((row, i) => {
    if (keep.has(i)) out.push(row.text);
    else if (out[out.length - 1] !== "…") out.push("…");
  });
  return out.join("\n").slice(0, limit);
};

// A pasted private script is promised never to leave the device, so only role names and
// line counts go with it. Bundled/ACT RAW scenes carry the speaker-labelled script.
export const rehearsalContextFor = (scene, roleIndex, feedbackLanguage) => {
  const lines = scene?.lines || [];
  const context = {
    sceneTitle: scene?.play,
    role: scene?.roles?.[roleIndex]?.name,
    partnerRole: scene?.roles?.[1 - roleIndex]?.name,
    scriptLanguage: sceneLanguage(scene),
    feedbackLanguage,
    userLineCount: lines.filter((line) => line.r === roleIndex).length,
    partnerLineCount: lines.filter((line) => line.r !== roleIndex).length,
  };
  if (!scene?.isPrivate) context.script = rehearsalScript(scene, roleIndex);
  return context;
};
