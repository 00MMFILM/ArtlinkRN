// The web casting page uses the same contract: one stored email, phone or HTTP(S)
// URL. Free-form instructions remain text; never guess a recipient from prose.
export function safePostingUrl(value) {
  if (typeof value !== "string") return "";
  const raw = value.trim();
  if (!/^https?:\/\//i.test(raw) || /[\s<>"'\\\u0000-\u001f\u007f]/.test(raw)) return "";
  if (/%(?:0[0-9a-f]|1[0-9a-f]|7f)/i.test(raw)) return "";
  try {
    const url = new URL(raw);
    if (!["http:", "https:"].includes(url.protocol) || !url.hostname || url.username || url.password) return "";
    return url.href;
  } catch {
    return "";
  }
}

const EMAIL_RE = /^[a-z0-9](?:[a-z0-9._+-]*[a-z0-9])?@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/i;
const PHONE_RE = /^0\d{1,2}-?\d{3,4}-?\d{4}$/;

export function resolveMatchingApplication(contactRaw, sourceUrlRaw) {
  const contact = typeof contactRaw === "string" ? contactRaw.trim() : "";
  const sourceUrl = safePostingUrl(sourceUrlRaw);
  const form = safePostingUrl(contact);
  if (form) return { kind: "form", value: contact, href: form, sourceUrl };
  if (contact.length <= 254 && EMAIL_RE.test(contact) && !contact.split("@")[0].includes("..")) {
    return { kind: "email", value: contact, href: `mailto:${encodeURIComponent(contact).replace("%40", "@")}`, sourceUrl };
  }
  const compact = contact.replace(/ /g, "");
  if (PHONE_RE.test(compact)) {
    return { kind: "phone", value: contact, href: `tel:${compact.replace(/-/g, "")}`, sourceUrl };
  }
  if (contact) return { kind: "text", value: contact, href: "", sourceUrl };
  return { kind: sourceUrl ? "source" : "none", value: "", href: sourceUrl, sourceUrl };
}

// Public casting dates are Korean calendar dates, including while travelling.
// The deadline itself remains open; only a previous date is expired.
export function matchingDeadlineDays(deadline, now = Date.now()) {
  if (typeof deadline !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(deadline)) return null;
  const target = Date.parse(`${deadline}T00:00:00Z`);
  if (!Number.isFinite(target) || new Date(target).toISOString().slice(0, 10) !== deadline) return null;
  const today = new Date(now + 9 * 3600000).toISOString().slice(0, 10);
  return Math.round((target - Date.parse(`${today}T00:00:00Z`)) / 86400000);
}

export function isMatchingClosed(post) {
  if (post.status && post.status !== "active") return true;
  const days = matchingDeadlineDays(post.deadline);
  return days !== null && days < 0;
}

export function matchingSourceName(post) {
  if (typeof post.sourcePlatform === "string" && post.sourcePlatform.trim()) return post.sourcePlatform.trim();
  const sourceUrl = safePostingUrl(post.sourceUrl);
  return sourceUrl ? new URL(sourceUrl).hostname : "";
}
