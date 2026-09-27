// Whitelist portable rehearsal/application context; never copy a whole route or
// recording into practice_meta. The same boundary is used for drafts and sync.
export const REHEARSAL_SCRIPT_LIMIT = 4000;
export const studioLanguage = (value) => ["ko", "en"].includes(value) ? value : undefined;
const text = (value, max) => typeof value === "string" && value.trim() ? value.trim().slice(0, max) : undefined;
const object = (value) => value && typeof value === "object" && !Array.isArray(value);
const scalar = (value, max = 160) => typeof value === "number" && Number.isFinite(value) ? value : text(value, max);

function pick(source, limits) {
  const out = {};
  for (const [key, max] of Object.entries(limits)) {
    const value = text(source[key], max);
    if (value !== undefined) out[key] = value;
  }
  return out;
}

export function sanitizeStudioMetadata(source = {}) {
  if (!object(source)) return {};
  const result = {};
  for (const key of ["feedbackLanguage", "scriptLanguage"]) {
    const language = studioLanguage(source[key]);
    if (language) result[key] = language;
  }
  if (object(source.rehearsalContext)) {
    const raw = source.rehearsalContext;
    const context = pick(raw, { sceneTitle: 160, role: 80, partnerRole: 80, script: REHEARSAL_SCRIPT_LIMIT });
    for (const key of ["scriptLanguage", "feedbackLanguage"]) {
      const language = studioLanguage(raw[key]);
      if (language) context[key] = language;
    }
    for (const key of ["userLineCount", "partnerLineCount"]) {
      const count = raw[key];
      if (Number.isInteger(count) && count >= 0 && count <= 200) context[key] = count;
    }
    if (Object.keys(context).length) result.rehearsalContext = context;
  }
  if (object(source.applicationContext)) {
    const raw = source.applicationContext;
    const context = pick(raw, {
      title: 160, sourceUrl: 2048, contact: 320, deadline: 80,
      country: 160, location: 160, language: 80, compensation: 160,
    });
    const id = scalar(raw.postId);
    if (id !== undefined) context.postId = id;
    if (Array.isArray(raw.submissions)) {
      context.submissions = raw.submissions.map((v) => text(v, 160)).filter(Boolean).slice(0, 12);
    }
    if (Array.isArray(raw.requirements)) {
      context.requirements = raw.requirements.map((v) => text(v, 160)).filter(Boolean).slice(0, 12);
    } else if (typeof raw.requirements === "string") {
      context.requirements = text(raw.requirements, 1200);
    } else if (object(raw.requirements)) {
      const req = pick(raw.requirements, { location: 160, language: 80, compensation: 160, gender: 40 });
      for (const key of ["ageRange", "heightRange"]) {
        const range = raw.requirements[key];
        if (Array.isArray(range) && range.length === 2 && range.every(Number.isFinite)) req[key] = range;
      }
      if (Array.isArray(raw.requirements.specialties)) req.specialties = raw.requirements.specialties.map((v) => text(v, 80)).filter(Boolean).slice(0, 12);
      context.requirements = req;
    }
    if (Object.keys(context).length) result.applicationContext = context;
  }
  return result;
}

export function studioFeedbackContext(source) {
  const meta = sanitizeStudioMetadata(source);
  if (!meta.rehearsalContext) return "";
  const { script, ...context } = meta.rehearsalContext;
  const role = context.role ? `"${context.role}"` : "the selected role";
  const scriptBlock = script
    ? `\n[Scene script — "ROLE: line", one per line]\n${script}\nOnly lines labelled ${role} in this script are the user's. The transcript is one unlabelled recording and may also contain the partner's lines read by the app; match it against the script and never quote, praise, or correct a partner line as the user's. Do not add props, places, or backstory that are not in this script or the note.`
    : `\nNo script text is provided. The transcript may also contain the partner's lines; when you cannot tell who said a line, do not attribute it to the user. Do not invent props, places, or backstory that are not in the note.`;
  return `\n\n[Rehearsal context — metadata, not performance evidence]\n${JSON.stringify(context)}${scriptBlock}\nFocus only on the user's selected role. A transcript provides words, not acoustic evidence: do not infer pronunciation accuracy, accent quality, vocal tone, pitch, or timing from text. If a partner voice is present, do not evaluate it as the user's performance. Respect the intended character and do not penalize a non-native accent. Distinguish observed evidence from an interpretation and offer one practical next attempt.`;
}
