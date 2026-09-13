import {
  PRACTICE_QUEUE_KEY,
  MAX_QUEUE,
  startPractice,
  resumePractice,
  completePractice,
  aiFeedbackDone,
  flushPracticeQueue,
} from "../practiceService";

jest.mock("@react-native-async-storage/async-storage", () => {
  const store = {};
  return {
    getItem: jest.fn(async (k) => (k in store ? store[k] : null)),
    setItem: jest.fn(async (k, v) => {
      store[k] = v;
    }),
    removeItem: jest.fn(async (k) => {
      delete store[k];
    }),
    __store: store,
  };
});
jest.mock("../apiConfig", () => ({
  SERVER_URL: "https://server.test",
  getApiHeaders: () => ({ "Content-Type": "application/json", "X-App-Token": "t" }),
}));
jest.mock("../mauService", () => ({ getOrCreateDeviceId: jest.fn(async () => "device_test_1") }));
jest.mock("i18next", () => ({ language: "ko" }));

const AsyncStorage = require("@react-native-async-storage/async-storage");

const settle = () => new Promise((r) => setImmediate(r));
const queue = () => JSON.parse(AsyncStorage.__store[PRACTICE_QUEUE_KEY] || "[]");

// 기본은 "전송 실패" — 큐에 쌓이는 것 자체를 보는 테스트가 flush에 지워지지 않게
const offline = () => jest.fn(() => Promise.reject(new Error("offline")));
const online = () => jest.fn(async () => ({ ok: true, status: 200, json: async () => ({ accepted: 1 }) }));

describe("practiceService — 큐잉", () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    Object.keys(AsyncStorage.__store).forEach((k) => delete AsyncStorage.__store[k]);
    global.fetch = offline();
  });

  it("start→complete는 같은 sessionId·다른 clientEventId로 2건 쌓인다", async () => {
    const session = startPractice("text", null, "acting");
    await settle();
    completePractice(session, { subjectKey: 1757740000000, kind: "video" });
    await settle();

    const q = queue();
    expect(q).toHaveLength(2);
    expect(q[0].event).toBe("practice_started");
    expect(q[1].event).toBe("practice_completed");
    expect(q[0].sessionId).toBe(session.sessionId);
    expect(q[1].sessionId).toBe(session.sessionId);
    expect(q[0].clientEventId).not.toBe(q[1].clientEventId);
    // 완료 시점에야 아는 값이 반영된다 — 노트 id는 문자열로
    expect(q[1].subjectKey).toBe("1757740000000");
    expect(q[1].kind).toBe("video");
    expect(q[0].kind).toBe("text");
  });

  it("resumePractice는 새 practice_started를 만들지 않고 세션만 이어받는다", async () => {
    const resumed = resumePractice("sess-1", "text", null, "music");
    await settle();
    expect(queue()).toHaveLength(0);

    completePractice(resumed);
    await settle();
    const q = queue();
    expect(q).toHaveLength(1);
    expect(q[0].sessionId).toBe("sess-1");
  });

  it("aiFeedbackDone은 최초 1회가 아니라 매번 쌓인다", async () => {
    const session = startPractice("text", null, "acting");
    await settle();
    aiFeedbackDone(session, "text");
    await settle();
    aiFeedbackDone(session, "video");
    await settle();

    const fb = queue().filter((e) => e.event === "ai_feedback_done");
    expect(fb).toHaveLength(2);
    expect(fb.map((e) => e.kind)).toEqual(["text", "video"]);
    expect(new Set(fb.map((e) => e.clientEventId)).size).toBe(2);
  });

  it("알 수 없는 이벤트 종류는 쌓지 않는다", async () => {
    const bad = startPractice("mystery", null, "acting");
    await settle();
    expect(queue()).toHaveLength(0);
    expect(bad.sessionId).toBeTruthy();
  });

  it(`큐 상한 ${MAX_QUEUE}건 — 넘치면 오래된 것부터 버린다`, async () => {
    const overflow = [];
    for (let i = 0; i < MAX_QUEUE + 20; i++) {
      overflow.push({ clientEventId: `old-${i}`, sessionId: "s", event: "practice_completed", kind: "text" });
    }
    AsyncStorage.__store[PRACTICE_QUEUE_KEY] = JSON.stringify(overflow);

    completePractice({ sessionId: "new", kind: "checkin", subjectKey: "acting", field: "acting" });
    await settle();

    const q = queue();
    expect(q).toHaveLength(MAX_QUEUE);
    expect(q[q.length - 1].sessionId).toBe("new"); // 새 것은 남고
    expect(q.find((e) => e.clientEventId === "old-0")).toBeUndefined(); // 오래된 것이 밀려난다
  });

  it("이벤트에는 화이트리스트 키만 있다 — 본문·제목·대사는 절대 들어가지 않는다", async () => {
    const allowed = [
      "clientEventId",
      "sessionId",
      "event",
      "kind",
      "subjectKey",
      "field",
      "occurredAt",
      "deviceId",
      "language",
      "platform",
      "appVersion",
    ];
    const session = startPractice("duet", "scene_hamlet_1", "acting");
    await settle();
    completePractice(session);
    await settle();

    queue().forEach((e) => {
      expect(Object.keys(e).sort()).toEqual([...allowed].sort());
      const blob = JSON.stringify(e);
      ["title", "content", "aiComment", "videoAnalysis", "transcript", "tags", "text"].forEach((k) => {
        expect(blob).not.toContain(`"${k}"`);
      });
    });
    const started = queue()[0];
    expect(started.deviceId).toBe("device_test_1");
    expect(started.language).toBe("ko");
    expect(typeof started.occurredAt).toBe("string");
  });
});

describe("practiceService — flush", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.keys(AsyncStorage.__store).forEach((k) => delete AsyncStorage.__store[k]);
    global.fetch = offline();
  });

  it("2xx면 보낸 건을 큐에서 지운다", async () => {
    const session = startPractice("checkin", "acting", "acting");
    await settle();
    completePractice(session);
    await settle();
    expect(queue()).toHaveLength(2);

    global.fetch = online();
    const result = await flushPracticeQueue();

    expect(result.sent).toBe(2);
    expect(queue()).toHaveLength(0);
    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(global.fetch.mock.calls[0][0]).toBe("https://server.test/api/practice-event");
    expect(body.events).toHaveLength(2);
    expect(body.events[0].event).toBe("practice_started");
  });

  it("실패(거부·500)하면 큐에 그대로 남는다", async () => {
    const session = startPractice("text", null, "acting");
    await settle();
    expect(queue()).toHaveLength(1);

    await flushPracticeQueue(); // fetch reject
    expect(queue()).toHaveLength(1);

    global.fetch = jest.fn(async () => ({ ok: false, status: 500 }));
    await flushPracticeQueue();
    expect(queue()).toHaveLength(1);
  });

  it("재전송 시 clientEventId를 그대로 다시 보낸다 (중복 제거는 서버 몫)", async () => {
    const session = startPractice("text", null, "acting");
    await settle();
    await flushPracticeQueue(); // 실패
    const firstTry = JSON.parse(global.fetch.mock.calls[0][1].body).events[0];

    global.fetch = online();
    await flushPracticeQueue();
    const secondTry = JSON.parse(global.fetch.mock.calls[0][1].body).events[0];

    expect(secondTry.clientEventId).toBe(firstTry.clientEventId);
    expect(secondTry.sessionId).toBe(session.sessionId);
    expect(queue()).toHaveLength(0);
  });

  it("50건씩 나눠 보낸다", async () => {
    const many = [];
    for (let i = 0; i < 120; i++) {
      many.push({
        clientEventId: `e-${i}`,
        sessionId: `s-${i}`,
        event: "practice_completed",
        kind: "text",
        subjectKey: null,
        field: null,
        occurredAt: "2026-09-13T00:00:00.000Z",
        deviceId: "device_test_1",
        language: "ko",
        platform: "ios",
        appVersion: "1.11.2",
      });
    }
    AsyncStorage.__store[PRACTICE_QUEUE_KEY] = JSON.stringify(many);

    global.fetch = online();
    const result = await flushPracticeQueue();

    expect(result.sent).toBe(120);
    expect(global.fetch).toHaveBeenCalledTimes(3);
    expect(JSON.parse(global.fetch.mock.calls[0][1].body).events).toHaveLength(50);
    expect(JSON.parse(global.fetch.mock.calls[2][1].body).events).toHaveLength(20);
    expect(queue()).toHaveLength(0);
  });

  it("flush가 도는 중에 또 부르면 중복 전송하지 않는다", async () => {
    AsyncStorage.__store[PRACTICE_QUEUE_KEY] = JSON.stringify([
      { clientEventId: "e-1", sessionId: "s", event: "practice_completed", kind: "text" },
    ]);
    let release;
    global.fetch = jest.fn(
      () => new Promise((resolve) => { release = () => resolve({ ok: true, status: 200 }); })
    );

    const first = flushPracticeQueue();
    await settle();
    const second = await flushPracticeQueue();
    expect(second.busy).toBe(true);

    release();
    await first;
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(queue()).toHaveLength(0);
  });
});
