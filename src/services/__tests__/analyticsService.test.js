import { computeArtistProfile } from "../analyticsService";

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
