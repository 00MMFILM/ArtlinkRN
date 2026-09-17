// supabase 클라이언트는 이 테스트에서 쓰지 않으므로 mock (env/네트워크 의존 제거)
jest.mock("../supabaseClient", () => ({ supabase: {} }));

import { mergeNotes } from "../notesSyncService";

const serverRow = (localId, { title = "server", updatedAt, createdAt } = {}) => ({
  local_id: localId,
  title,
  content: "server content",
  field: null,
  tags: [],
  starred: false,
  created_at: createdAt || "2026-01-01T00:00:00.000Z",
  updated_at: updatedAt || "2026-01-01T00:00:00.000Z",
});

describe("mergeNotes", () => {
  it("서버 fetch 대기 중 새로 저장된 로컬 노트를 보존한다 (데이터 유실 재현 방지)", () => {
    // 로그인 직후 서버에서 노트를 받아오는 사이 사용자가 만든 신규 노트
    const localNew = {
      id: 999,
      title: "fetch 대기 중 작성한 노트",
      content: "local only",
      createdAt: "2026-02-01T00:00:00.000Z",
      updatedAt: "2026-02-01T00:00:00.000Z",
    };
    const local = [localNew];
    const server = [serverRow(1)];

    const merged = mergeNotes(local, server);

    expect(merged.map((n) => n.id).sort()).toEqual([1, 999]);
    expect(merged.find((n) => n.id === 999)).toEqual(localNew);
  });

  it("같은 노트는 updated_at 최신 쪽이 이긴다", () => {
    const local = [{ id: 1, title: "local newer", content: "local", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-03-01T00:00:00.000Z" }];
    const mergedLocalWins = mergeNotes(local, [serverRow(1, { updatedAt: "2026-02-01T00:00:00.000Z" })]);
    expect(mergedLocalWins[0].title).toBe("local newer");

    const mergedServerWins = mergeNotes(local, [serverRow(1, { title: "server newer", updatedAt: "2026-04-01T00:00:00.000Z" })]);
    expect(mergedServerWins[0].title).toBe("server newer");
  });

  it("입력 배열/객체를 변형하지 않는 순수 함수다 (함수형 setState에서 prev 기준 병합 안전)", () => {
    const localNote = { id: 1, title: "local", content: "local", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" };
    const local = [localNote];
    const snapshot = JSON.stringify(local);

    mergeNotes(local, [serverRow(1, { title: "server newer", updatedAt: "2026-05-01T00:00:00.000Z" }), serverRow(2)]);

    expect(local).toHaveLength(1);
    expect(JSON.stringify(local)).toBe(snapshot);
  });
});

// 재연습 체인(sceneId·parentNoteId·rootNoteId·focus)은 서버 user_notes에 컬럼이 없다.
// 서버 행이 더 최신이어도 이 필드를 덮어쓰면 "지난 연습" 연결이 끊긴다.
describe("mergeNotes — 기기 로컬 전용 재연습 체인 보존", () => {
  it("서버가 더 최신이어도 체인 필드와 미디어는 로컬 값을 유지한다", () => {
    const local = [{
      id: 1,
      title: "local",
      content: "local",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      images: [{ uri: "file:///a.jpg" }],
      sceneId: "hamlet-1",
      parentNoteId: 100,
      rootNoteId: 100,
      focus: "첫 문장 호흡 늦추기",
      chosenFocus: "시선 고정",
      focusOptions: ["시선 고정"],
    }];
    const merged = mergeNotes(local, [serverRow(1, { title: "server newer", updatedAt: "2026-05-01T00:00:00.000Z" })]);

    expect(merged[0].title).toBe("server newer"); // 본문은 서버가 이긴다
    expect(merged[0].sceneId).toBe("hamlet-1");
    expect(merged[0].parentNoteId).toBe(100);
    expect(merged[0].rootNoteId).toBe(100);
    expect(merged[0].focus).toBe("첫 문장 호흡 늦추기");
    expect(merged[0].chosenFocus).toBe("시선 고정");
    expect(merged[0].focusOptions).toEqual(["시선 고정"]);
    expect(merged[0].images).toEqual([{ uri: "file:///a.jpg" }]);
  });
});
