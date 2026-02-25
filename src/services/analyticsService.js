import { FIELD_LABELS, FIELD_EMOJIS } from "../constants/theme";

export function getRelatedNotes(note, allNotes, maxResults = 5) {
  if (!note || allNotes.length < 2) return [];
  return allNotes
    .filter((n) => n.id !== note.id)
    .map((n) => {
      let score = 0;
      if (n.field === note.field) score += 3;
      const shared = (note.tags || []).filter((t) => (n.tags || []).includes(t)).length;
      score += shared * 2;
      if (note.seriesName && n.seriesName && note.seriesName === n.seriesName) score += 5;
      const titleWords = (note.title || "").split(/\s+/).filter((w) => w.length > 1);
      const nTitleWords = (n.title || "").split(/\s+/).filter((w) => w.length > 1);
      score += titleWords.filter((w) => nTitleWords.includes(w)).length * 1.5;
      const daysDiff = Math.abs(new Date(note.createdAt) - new Date(n.createdAt)) / 86400000;
      if (daysDiff <= 3) score += 1;
      return { note: n, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults);
}

export function getNoteSeries(allNotes) {
  const seriesMap = {};
  allNotes.forEach((n) => {
    if (n.seriesName) {
      if (!seriesMap[n.seriesName]) seriesMap[n.seriesName] = [];
      seriesMap[n.seriesName].push(n);
    }
  });
  const titleGroups = {};
  allNotes.forEach((n) => {
    if (!n.title) return;
    const base = n.title.replace(/[#\d\s]+$/, "").replace(/\s*\d+\s*$/, "").trim();
    if (base.length > 2) {
      if (!titleGroups[base]) titleGroups[base] = [];
      titleGroups[base].push(n);
    }
  });
  Object.entries(titleGroups).forEach(([base, notes]) => {
    if (notes.length >= 2 && !seriesMap[base]) {
      seriesMap[base] = notes.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    }
  });
  return seriesMap;
}

export function computeArtistProfile(savedNotes, userProfile = {}) {
  const fieldCounts = {};
  const tagCounts = {};
  const monthlyActivity = {};
  let totalContentLength = 0;

  savedNotes.forEach((n) => {
    fieldCounts[n.field] = (fieldCounts[n.field] || 0) + 1;
    (n.tags || []).forEach((t) => { tagCounts[t] = (tagCounts[t] || 0) + 1; });
    const mk = new Date(n.createdAt).toISOString().slice(0, 7);
    monthlyActivity[mk] = (monthlyActivity[mk] || 0) + 1;
    totalContentLength += (n.content || "").length;
  });

  const topFields = Object.entries(fieldCounts).sort((a, b) => b[1] - a[1]);
  const topTags = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]).slice(0, 12);
  const aiAnalyzedCount = savedNotes.filter((n) => n.aiComment).length;
  const primaryField = topFields[0]?.[0] || userProfile.fields?.[0] || "acting";

  const noteScore = Math.min(100, savedNotes.length * 5);
  const aiScore = Math.min(100, aiAnalyzedCount * 10);
  const diversityScore = Math.min(100, Object.keys(fieldCounts).length * 20);
  const depthScore = Math.min(100, Math.round(totalContentLength / 100));
  const consistencyScore = (() => {
    if (savedNotes.length < 2) return 0;
    const dates = savedNotes.map((n) => new Date(n.createdAt).toDateString());
    return Math.min(100, [...new Set(dates)].length * 8);
  })();
  const overallScore = Math.round((noteScore + aiScore + diversityScore + depthScore + consistencyScore) / 5);

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const hasNoteToday = savedNotes.some((n) => new Date(n.createdAt) >= todayStart);
  let streak = 0;
  for (let i = hasNoteToday ? 0 : 1; i < 365; i++) {
    const ds = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const de = new Date(ds.getTime() + 86400000);
    if (savedNotes.some((n) => { const d = new Date(n.createdAt); return d >= ds && d < de; })) streak++;
    else break;
  }

  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - now.getDay());
  weekStart.setHours(0, 0, 0, 0);
  const weekNotes = savedNotes.filter((n) => new Date(n.createdAt) >= weekStart);
  const lastWeekStart = new Date(weekStart);
  lastWeekStart.setDate(lastWeekStart.getDate() - 7);
  const lastWeekNotes = savedNotes.filter((n) => {
    const d = new Date(n.createdAt);
    return d >= lastWeekStart && d < weekStart;
  });
  const weekGrowth = lastWeekNotes.length > 0
    ? Math.round(((weekNotes.length - lastWeekNotes.length) / lastWeekNotes.length) * 100)
    : weekNotes.length > 0 ? 100 : 0;

  const featuredNotes = savedNotes
    .filter((n) => n.aiComment || (n.content || "").length > 100)
    .sort((a, b) => (b.content || "").length - (a.content || "").length)
    .slice(0, 5);

  const radarValues = [noteScore, aiScore, diversityScore, depthScore, consistencyScore, Math.min(100, topTags.length * 10)];
  const radarLabels = ["기록량", "AI활용", "다양성", "깊이", "꾸준함", "전문성"];

  return {
    fieldCounts, tagCounts, topFields, topTags, monthlyActivity,
    totalContentLength, aiAnalyzedCount, primaryField,
    noteScore, aiScore, diversityScore, depthScore, consistencyScore, overallScore,
    streak, hasNoteToday,
    weekNotes, weekGrowth,
    featuredNotes, radarValues, radarLabels,
    fieldLabels: FIELD_LABELS, fieldEmojis: FIELD_EMOJIS,
    displayName: userProfile.name || "아티스트",
    displayFields: topFields.length > 0
      ? topFields.slice(0, 3).map(([f]) => FIELD_LABELS[f] || f).join(" · ")
      : (userProfile.fields || []).map((f) => FIELD_LABELS[f] || f).join(" · ") || "예술",
  };
}
