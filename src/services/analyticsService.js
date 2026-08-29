import { FIELD_LABELS, FIELD_EMOJIS } from "../constants/theme";
import { toLocalDateKey } from "../utils/helpers";

// 마일리지 레벨 임계값(서버 artlink-server와 반드시 동일한 공식 — 임의 변경 금지)
export function thresholdForLevel(level) {
  return 25 * level * (level + 1);
}

// 레벨 상한 없음. threshold(L) <= mileage 인 가장 큰 L, 최소 1.
export function levelForMileage(mileage) {
  const xp = Math.max(0, mileage || 0);
  let level = 0;
  while (thresholdForLevel(level + 1) <= xp) level++;
  return Math.max(1, level);
}

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
  let mediaRecordCount = 0;
  const recordedLocalDates = new Set();

  savedNotes.forEach((n) => {
    fieldCounts[n.field] = (fieldCounts[n.field] || 0) + 1;
    (n.tags || []).forEach((t) => { tagCounts[t] = (tagCounts[t] || 0) + 1; });
    const mk = new Date(n.createdAt).toISOString().slice(0, 7);
    monthlyActivity[mk] = (monthlyActivity[mk] || 0) + 1;
    // 말로 남긴 기록(전사)도 쓴 기록과 동등하게 분량으로 센다.
    totalContentLength += (n.content || "").length + (n.transcript || "").length;
    mediaRecordCount +=
      (n.images?.length || 0) +
      (n.voiceRecordings?.length || 0) +
      (n.audioFiles?.length || 0) +
      (n.videoAnalysis ? 1 : 0);
    // 마일리지의 '기록한 날수'는 로컬 날짜 기준(UTC면 KST 새벽에 어긋난다).
    recordedLocalDates.add(toLocalDateKey(n.createdAt));
  });

  const topFields = Object.entries(fieldCounts).sort((a, b) => b[1] - a[1]);
  const topTags = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]).slice(0, 12);
  const aiAnalyzedCount = savedNotes.filter((n) => n.aiComment).length;
  const primaryField = topFields[0]?.[0] || userProfile.fields?.[0] || "acting";

  const noteScore = Math.min(100, savedNotes.length * 5);
  const aiScore = Math.min(100, aiAnalyzedCount * 10);
  const diversityScore = Math.min(100, Object.keys(fieldCounts).length * 20);
  // 전문성 — 한 분야만 파는 사용자가 구조적으로 불리하던 문제 수정(2026-08-27 실사용자 제보).
  // 예전 종합점수는 '다양성(분야수×20)'을 썼는데, 연기만 하는 성실한 학생일수록 3~4주 만에
  // 다른 축이 다 포화되고 다양성 20점에 막혀 60점대 초반에서 영구 정지했다(실데이터 4명 검증).
  // 분야 수와 태그 다양성(같은 분야 안에서 기법·감정을 얼마나 폭넓게 다뤘나) 중 큰 쪽을 쓴다 —
  // max()라 어떤 기존 사용자도 점수가 내려가지 않고, 태그는 연습할수록 쌓여 점수가 계속 움직인다.
  // 2026-08-29 추가: 태그 보정은 실사용자에게 작동하지 않았다(실사용자 22명 중 태그 사용 4명,
  // 최대 5개). 한 분야를 깊게 판 기록량 자체를 전문성으로 인정한다 — 연기만 33개 쌓은 사용자가
  // 분야 수 1개라는 이유로 20점에 묶이던 것이 실제 원인이었다(실데이터 확인).
  const primaryFieldCount = Object.values(fieldCounts).reduce((m, v) => Math.max(m, v), 0);
  const specializationScore = Math.min(100, Math.max(
    Object.keys(fieldCounts).length * 20,
    Object.keys(tagCounts).length * 8,
    primaryFieldCount * 8,
  ));
  // 깊이 — 타이핑한 글자 수만 세면 영상·음성으로 연습을 남기는 사용자가 구조적으로 0점이 된다
  // (실데이터: 노트 33개에 타이핑 345자, 영상 기록은 점수에 전혀 반영 안 됨).
  // 전사는 위에서 글자 수로 합산하고, 첨부한 영상·음성·사진 기록은 건당 가중치로 인정한다.
  const depthScore = Math.min(100, Math.round(totalContentLength / 100) + mediaRecordCount * 5);
  const consistencyScore = (() => {
    if (savedNotes.length < 2) return 0;
    const dates = savedNotes.map((n) => new Date(n.createdAt).toDateString());
    return Math.min(100, [...new Set(dates)].length * 8);
  })();
  const overallScore = Math.round((noteScore + aiScore + specializationScore + depthScore + consistencyScore) / 5);

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

  // 레이더의 '전문성'이 태그 개수 기반이라, 태그를 안 쓰는 사용자는 종합점수에 반영된 전문성과
  // 무관하게 0으로 보였다(2026-08-29). 종합점수와 같은 값을 쓰도록 정합시킨다.
  const radarValues = [noteScore, aiScore, diversityScore, depthScore, consistencyScore, specializationScore];
  const radarLabels = ["기록량", "AI활용", "다양성", "깊이", "꾸준함", "전문성"];

  // 연습 마일리지 — 서버(artlink-server)와 동일한 공식. 화면 즉시 표시용 로컬 계산.
  // mileage = 노트수*10 + AI분석수*15 + 기록한날수*20 + 미디어수*15 + floor(총글자수/100)
  const recordedDaysCount = recordedLocalDates.size;
  const mileage =
    savedNotes.length * 10 +
    aiAnalyzedCount * 15 +
    recordedDaysCount * 20 +
    mediaRecordCount * 15 +
    Math.floor(totalContentLength / 100);
  const level = levelForMileage(mileage);
  const nextLevelAt = thresholdForLevel(level + 1);
  // 레벨1은 threshold(1)=50이 아니라 0에서 시작한다(모두가 0마일리지로 레벨1에서 출발).
  const levelSegmentStart = level === 1 ? 0 : thresholdForLevel(level);
  const mileageProgress = nextLevelAt > levelSegmentStart
    ? Math.min(1, Math.max(0, (mileage - levelSegmentStart) / (nextLevelAt - levelSegmentStart)))
    : 0;

  return {
    fieldCounts, tagCounts, topFields, topTags, monthlyActivity,
    totalContentLength, aiAnalyzedCount, primaryField,
    noteScore, aiScore, diversityScore, specializationScore, depthScore, consistencyScore, overallScore,
    streak, hasNoteToday,
    weekNotes, weekGrowth,
    mileage, level, nextLevelAt, mileageProgress,
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
