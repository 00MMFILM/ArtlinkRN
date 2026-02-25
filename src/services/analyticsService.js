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

export function computeMatchPercent(project, artistProfile, userProfile, portfolioItems = []) {
  const req = project.requirements || {};
  let score = 0;

  // 1. Field overlap (0-25)
  const userFields = userProfile.fields || [];
  const topFieldKeys = (artistProfile.topFields || []).map(([f]) => f);
  if (topFieldKeys[0] === project.field || userFields[0] === project.field) {
    score += 25;
  } else if ([...userFields, ...topFieldKeys].includes(project.field)) {
    score += 15;
  }

  // 2. Body/physical conditions (0-20)
  let bodyScore = 0;
  let bodyFactors = 0;

  if (req.gender) {
    bodyFactors++;
    if (userProfile.gender === req.gender) bodyScore += 1;
  }
  if (req.ageRange && req.ageRange.length === 2) {
    bodyFactors++;
    const age = _calculateAge(userProfile.birthDate);
    if (age && age >= req.ageRange[0] && age <= req.ageRange[1]) bodyScore += 1;
    else if (age) bodyScore += 0; // out of range
    else bodyScore += 0.5; // no data = partial
  }
  if (req.heightRange && req.heightRange.length === 2) {
    bodyFactors++;
    const h = userProfile.height;
    if (h && h >= req.heightRange[0] && h <= req.heightRange[1]) bodyScore += 1;
    else if (h) bodyScore += 0;
    else bodyScore += 0.5;
  }
  if (bodyFactors > 0) {
    score += Math.round((bodyScore / bodyFactors) * 20);
  } else {
    score += 10; // no requirements = partial score
  }

  // 3. Specialties (0-15)
  const reqSpecialties = req.specialties || [];
  if (reqSpecialties.length > 0) {
    const userSpecs = userProfile.specialties || [];
    const matched = reqSpecialties.filter((s) => userSpecs.includes(s)).length;
    score += Math.round((matched / reqSpecialties.length) * 15);
  } else {
    score += 8;
  }

  // 4. Skill scores (0-15)
  score += Math.round(((artistProfile.overallScore || 0) / 100) * 15);

  // 5. Portfolio presence (0-10)
  const fieldPortfolioCount = portfolioItems.filter((i) => i.field === project.field).length;
  score += Math.min(10, fieldPortfolioCount * 3);

  // 6. Tag relevance (0-10)
  const topTags = (artistProfile.topTags || []).map(([t]) => t.toLowerCase());
  const projectWords = (project.title + " " + project.description).toLowerCase().split(/\s+/);
  const tagOverlap = topTags.filter((t) => projectWords.some((w) => w.includes(t) || t.includes(w))).length;
  score += Math.min(10, tagOverlap * 3);

  // 7. Location (0-5)
  if (req.location) {
    if (userProfile.location && userProfile.location.includes(req.location)) score += 5;
  } else {
    score += 3;
  }

  return Math.min(100, score);
}

function _calculateAge(birthDate) {
  if (!birthDate) return null;
  const birth = new Date(birthDate);
  if (isNaN(birth.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age > 0 ? age : null;
}

// Recommend postings for a user (forward matching)
export function getRecommendedPostings(userProfile, artistProfile, portfolioItems, allPostings) {
  return allPostings
    .map((p) => ({ ...p, matchPercent: computeMatchPercent(p, artistProfile, userProfile, portfolioItems) }))
    .sort((a, b) => b.matchPercent - a.matchPercent);
}

// Recommend actors for a posting (reverse matching - casting director view)
export function getRecommendedActors(posting, actorProfiles) {
  const req = posting.requirements || {};
  return actorProfiles
    .map((actor) => {
      let score = 0;
      let factors = 0;

      // Field match
      factors++;
      if ((actor.fields || []).includes(posting.field)) score += 1;

      // Gender
      if (req.gender) {
        factors++;
        if (actor.gender === req.gender) score += 1;
      }
      // Age
      if (req.ageRange) {
        factors++;
        const age = _calculateAge(actor.birthDate);
        if (age && age >= req.ageRange[0] && age <= req.ageRange[1]) score += 1;
        else if (!age) score += 0.5;
      }
      // Height
      if (req.heightRange) {
        factors++;
        if (actor.height && actor.height >= req.heightRange[0] && actor.height <= req.heightRange[1]) score += 1;
        else if (!actor.height) score += 0.5;
      }
      // Specialties
      if (req.specialties && req.specialties.length > 0) {
        factors++;
        const matched = req.specialties.filter((s) => (actor.specialties || []).includes(s)).length;
        score += matched / req.specialties.length;
      }
      // Location
      if (req.location) {
        factors++;
        if (actor.location && actor.location.includes(req.location)) score += 1;
      }

      const matchPercent = factors > 0 ? Math.round((score / factors) * 100) : 50;
      return { ...actor, matchPercent };
    })
    .sort((a, b) => b.matchPercent - a.matchPercent);
}
