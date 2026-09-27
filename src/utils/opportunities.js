import { matchingDeadlineDays, isMatchingClosed, resolveMatchingApplication, safePostingUrl } from "./matchingApplication";

const text = (value) => typeof value === "string" ? value.trim() : "";
const firstText = (...values) => values.map(text).find(Boolean) || "";
const stringList = (value) => Array.isArray(value) ? value.map(text).filter(Boolean) : text(value) ? [text(value)] : [];
export const opportunityKey = (post) => `${post.source === "ai" ? "ai" : "user"}:${String(post.id)}`;

// Read explicit structured fields only. A Korean source or an English description
// does not establish a country, required language, remote eligibility or pay.
export function opportunityFacts(post = {}) {
  const req = post.requirements && typeof post.requirements === "object" ? post.requirements : {};
  const pay = firstText(post.pay, post.compensation, req.pay, req.compensation);
  const languages = stringList(post.languages || post.language || req.languages || req.language);
  const remote = typeof post.remote === "boolean" ? post.remote
    : typeof req.remote === "boolean" ? req.remote : null;
  const paid = typeof post.isPaid === "boolean" ? post.isPaid
    : typeof req.isPaid === "boolean" ? req.isPaid
      : /^(유급|paid)$/i.test(pay) ? true
        : /^(무급|없음|unpaid|no pay|0(?:원|\s*krw)?)$/i.test(pay) ? false
          : /(?:[1-9][\d,.]*\s*(?:원|만원|달러|USD|KRW|EUR|GBP)|[$€£]\s*[1-9])/i.test(pay) && !/(협의|미정|negotiable|tbd|unpaid|무급)/i.test(pay) ? true : null;
  return {
    location: firstText(post.location, req.location), country: firstText(post.country, req.country),
    languages, pay, paid, remote,
    submissions: stringList(post.submissions || req.submissions || req.materials),
  };
}

export function filterOpportunities(posts, filters = {}) {
  const query = text(filters.search).toLowerCase();
  return posts.filter((post) => {
    // The explicit member-post filter doubles as the management entry for an
    // author's expired listings. Latest/Deadline remain current by default.
    const includeClosedMember = filters.source === "user" && post.source === "user";
    if (filters.view !== "saved" && !includeClosedMember && isMatchingClosed(post)) return false;
    if (filters.source && filters.source !== "all" && post.source !== filters.source) return false;
    if (filters.category && filters.category !== "all" && post.tab !== filters.category) return false;
    if (filters.field && filters.field !== "all" && post.field !== filters.field) return false;
    const facts = opportunityFacts(post);
    if (filters.region && !`${facts.country} ${facts.location}`.toLowerCase().includes(filters.region.trim().toLowerCase())) return false;
    if (filters.language && !facts.languages.some((language) => language.toLowerCase().includes(filters.language.trim().toLowerCase()))) return false;
    if (filters.paid && facts.paid !== true) return false;
    if (filters.remote && facts.remote !== true) return false;
    if (query && ![post.title, post.description, ...stringList(post.tags), facts.location, facts.country].some((value) => text(value).toLowerCase().includes(query))) return false;
    return true;
  }).sort((a, b) => filters.view === "deadline"
    ? (matchingDeadlineDays(a.deadline) ?? Infinity) - (matchingDeadlineDays(b.deadline) ?? Infinity)
    : 0); // The feed's crawled_at order is authoritative; don't invent dates.
}

export function opportunityReasons(post, userFields = [], filters = {}) {
  const facts = opportunityFacts(post), reasons = [];
  if (Array.isArray(userFields) && userFields.includes(post.field)) reasons.push("field_match");
  if (filters.region && `${facts.country} ${facts.location}`.toLowerCase().includes(filters.region.trim().toLowerCase())) reasons.push("region_match");
  if (filters.language && facts.languages.some((v) => v.toLowerCase().includes(filters.language.trim().toLowerCase()))) reasons.push("language_match");
  return reasons;
}

export function buildApplicationPrefill(post, t) {
  const facts = opportunityFacts(post), application = resolveMatchingApplication(post.contact, post.sourceUrl);
  const unknown = t("opportunities.unspecified");
  const deadline = matchingDeadlineDays(post.deadline) !== null ? post.deadline : unknown;
  const rows = [
    t("opportunities.check_original"),
    `${t("opportunities.deadline")}: ${deadline}`,
    `${t("opportunities.location")}: ${[facts.country, facts.location].filter(Boolean).join(" · ") || unknown}`,
    `${t("opportunities.language")}: ${facts.languages.join(", ") || unknown}`,
    `${t("opportunities.pay")}: ${facts.pay || unknown}`,
    `${t("opportunities.materials")}: ${facts.submissions.join(", ") || t("opportunities.materials_unknown")}`,
    `${t("opportunities.application")}: ${application.value || application.sourceUrl || unknown}`,
    ...(application.sourceUrl ? [`${t("matchingDetail.view_original")}: ${application.sourceUrl}`] : []),
    t("opportunities.prepare_work"), t("opportunities.review_then_apply"),
  ];
  return {
    title: t("opportunities.preparation_title", { title: text(post.title) }),
    field: post.field || "acting", content: rows.map((row) => `☐ ${row}`).join("\n\n"),
    applicationContext: {
      postId: String(post.id), title: text(post.title), sourceUrl: safePostingUrl(post.sourceUrl),
      contact: text(post.contact), deadline: matchingDeadlineDays(post.deadline) !== null ? post.deadline : null,
      location: facts.location, country: facts.country, language: facts.languages.join(", "),
      compensation: facts.pay, submissions: facts.submissions,
    },
  };
}
