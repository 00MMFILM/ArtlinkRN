import { computeArtistProfile, levelForMileage, thresholdForLevel } from "../analyticsService";

// 2026-08-29 실사용자 제보: 한 분야만 성실히 파는 사용자의 종합점수가 고정되던 버그.
// 실데이터(엄성욱: 노트 33개·AI 30개·26일 기록)로 재현하고, 고쳐진 상태를 고정한다.
function makeNotes(count, { field = "acting", content = "짧은 메모", daysSpread = 26, ai = true, media = null } = {}) {
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    field,
    title: `노트 ${i + 1}`,
    content,
    tags: [],
    createdAt: new Date(2026, 7, 1 + (i % daysSpread)).toISOString(),
    aiComment: ai ? "AI 피드백" : undefined,
    ...(media || {}),
  }));
}

describe("computeArtistProfile — 전문성(단일 분야 고정 버그)", () => {
  it("한 분야에 33개를 쌓은 사용자는 전문성이 만점이 된다 (기존 20점 고정 해소)", () => {
    const p = computeArtistProfile(makeNotes(33), {});
    expect(p.specializationScore).toBe(100);
    // 분야 수(1×20=20)나 태그 수(0)가 아니라 주력 분야 기록량(33×8)이 반영돼야 한다
    expect(p.overallScore).toBeGreaterThan(65);
  });

  it("노트가 적으면 전문성도 낮게 유지된다 (무조건 만점 아님)", () => {
    const p = computeArtistProfile(makeNotes(3), {});
    expect(p.specializationScore).toBe(24); // 3 × 8
  });

  it("여러 분야를 다루던 기존 사용자는 점수가 내려가지 않는다", () => {
    const multi = [
      ...makeNotes(4, { field: "acting" }),
      ...makeNotes(4, { field: "music" }),
      ...makeNotes(4, { field: "dance" }),
    ];
    const p = computeArtistProfile(multi, {});
    // 분야 3개 × 20 = 60 이상이어야 한다(주력분야 4개×8=32보다 큰 쪽이 채택)
    expect(p.specializationScore).toBeGreaterThanOrEqual(60);
  });
});

describe("computeArtistProfile — 깊이(영상·음성 기록 미반영 버그)", () => {
  it("영상·음성으로 남긴 기록도 깊이에 반영된다", () => {
    const typedOnly = computeArtistProfile(makeNotes(5, { content: "짧음" }), {});
    const withMedia = computeArtistProfile(
      makeNotes(5, {
        content: "짧음",
        media: { videoAnalysis: "영상 분석 결과", voiceRecordings: ["a.m4a"] },
      }),
      {}
    );
    expect(withMedia.depthScore).toBeGreaterThan(typedOnly.depthScore);
  });

  it("전사(말로 남긴 기록)는 타이핑한 글자와 동등하게 분량으로 센다", () => {
    const withTranscript = computeArtistProfile(
      makeNotes(3, { content: "짧음", media: { transcript: "가".repeat(500) } }),
      {}
    );
    const without = computeArtistProfile(makeNotes(3, { content: "짧음" }), {});
    expect(withTranscript.depthScore).toBeGreaterThan(without.depthScore);
  });

  it("빈 노트 배열에서도 안전하게 0점을 반환한다", () => {
    const p = computeArtistProfile([], {});
    expect(p.overallScore).toBe(0);
    expect(p.specializationScore).toBe(0);
  });
});

// 2026-08-29 연습 마일리지·레벨 — 서버(artlink-server)와 동일한 공식.
// mileage = 노트수*10 + AI분석수*15 + 기록한날수*20 + 미디어수*15 + floor(총글자수/100)
// level(L) threshold = 25*L*(L+1), 상한 없음.
describe("levelForMileage — 검증 오라클", () => {
  it.each([
    [1333, 6],
    [1406, 7],
    [1487, 7],
    [1140, 6],
    [971, 5],
    [536, 4],
    [45, 1],
    [0, 1],
  ])("mileage %i -> level %i", (mileage, expectedLevel) => {
    expect(levelForMileage(mileage)).toBe(expectedLevel);
  });

  it("threshold(L) = 25*L*(L+1) — Lv1~Lv10", () => {
    expect(thresholdForLevel(1)).toBe(50);
    expect(thresholdForLevel(2)).toBe(150);
    expect(thresholdForLevel(3)).toBe(300);
    expect(thresholdForLevel(4)).toBe(500);
    expect(thresholdForLevel(5)).toBe(750);
    expect(thresholdForLevel(6)).toBe(1050);
    expect(thresholdForLevel(7)).toBe(1400);
    expect(thresholdForLevel(10)).toBe(2750);
  });
});

// 엄성욱 실데이터 재현: 노트 33개·AI 30개·기록 26일·영상분석 2개·타이핑 총 345자, 사진/음성 없음
// -> mileage 1333, level 6 (서버 실측값과 일치해야 함)
function makeSeongwookNotes({ withPhotosAndVoice = false } = {}) {
  const notes = [];
  for (let i = 0; i < 33; i++) {
    notes.push({
      id: i + 1,
      field: "acting",
      title: `노트 ${i + 1}`,
      content: i === 0 ? "가".repeat(345) : "",
      tags: [],
      createdAt: new Date(2026, 7, 1 + (i % 26)).toISOString(),
      aiComment: i < 30 ? "AI 피드백" : undefined,
      videoAnalysis: i < 2 ? "영상 분석 결과" : undefined,
      ...(withPhotosAndVoice && i === 0
        ? { images: ["a.jpg", "b.jpg"], voiceRecordings: ["c.m4a"] }
        : {}),
    });
  }
  return notes;
}

describe("computeArtistProfile — 마일리지·레벨", () => {
  it("엄성욱 실데이터 재현: mileage 1333, level 6", () => {
    const p = computeArtistProfile(makeSeongwookNotes(), {});
    expect(p.mileage).toBe(1333);
    expect(p.level).toBe(6);
  });

  it("사진·음성이 있으면 마일리지가 더 오른다", () => {
    const base = computeArtistProfile(makeSeongwookNotes(), {});
    const withMedia = computeArtistProfile(makeSeongwookNotes({ withPhotosAndVoice: true }), {});
    expect(withMedia.mileage).toBeGreaterThan(base.mileage);
  });

  it("노트 0개 -> mileage 0, level 1", () => {
    const p = computeArtistProfile([], {});
    expect(p.mileage).toBe(0);
    expect(p.level).toBe(1);
  });

  it("mileageProgress는 0~1 범위 안에 있다", () => {
    const seongwook = computeArtistProfile(makeSeongwookNotes(), {});
    expect(seongwook.mileageProgress).toBeGreaterThanOrEqual(0);
    expect(seongwook.mileageProgress).toBeLessThanOrEqual(1);

    const empty = computeArtistProfile([], {});
    expect(empty.mileageProgress).toBeGreaterThanOrEqual(0);
    expect(empty.mileageProgress).toBeLessThanOrEqual(1);

    // 오라클 mileage 값들도 computeArtistProfile 없이 직접 검산
    [0, 45, 536, 971, 1140, 1333, 1406, 1487].forEach((mileage) => {
      const level = levelForMileage(mileage);
      const nextAt = thresholdForLevel(level + 1);
      const start = level === 1 ? 0 : thresholdForLevel(level);
      const progress = (mileage - start) / (nextAt - start);
      expect(progress).toBeGreaterThanOrEqual(0);
      expect(progress).toBeLessThanOrEqual(1);
    });
  });
});
