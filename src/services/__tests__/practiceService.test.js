import {
  PRACTICE_QUEUE_KEY,
  MAX_QUEUE,
  startPractice,
  resumePractice,
  completePractice,
  abandonPractice,
  aiFeedbackDone,
  flushPracticeQueue,
  getPracticeLog,
  PRACTICE_LOG_KEY,
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
      // 완료·이탈에만 소요 시간이 붙는다 (1.11.8)
      const expected = e.event === "practice_started" ? allowed : [...allowed, "elapsedMs"];
      expect(Object.keys(e).sort()).toEqual([...expected].sort());
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

describe("practiceService — 완료 중복 방지", () => {
  beforeEach(() => {
    Object.keys(AsyncStorage.__store).forEach((k) => delete AsyncStorage.__store[k]);
    global.fetch = offline();
  });

  it("같은 세션을 두 번 완료해도(2인 대사 → 이어받은 노트 저장) practice_completed는 1건", async () => {
    const duet = startPractice("duet", "hamlet-1", "acting");
    await settle();
    completePractice(duet);
    await settle();
    const resumed = resumePractice(duet.sessionId, "text", "hamlet-1", "acting");
    completePractice(resumed, { subjectKey: 123 });
    await settle();
    expect(queue().filter((e) => e.event === "practice_completed")).toHaveLength(1);
  });
});

// 1.11.8 — 시작 대비 완료가 21%다. 어디서 얼마나 붙들다 그만두는지 보려면 이탈도 세야 한다.
describe("practiceService — 이탈", () => {
  beforeEach(() => {
    Object.keys(AsyncStorage.__store).forEach((k) => delete AsyncStorage.__store[k]);
    global.fetch = offline();
  });

  it("완료 없이 떠나면 practice_abandoned 1건이 쌓인다", async () => {
    const session = startPractice("text", null, "acting");
    await settle();
    abandonPractice(session);
    await settle();

    const q = queue();
    expect(q.map((e) => e.event)).toEqual(["practice_started", "practice_abandoned"]);
    expect(q[1].sessionId).toBe(session.sessionId);
    expect(q[1].kind).toBe("text");
  });

  it("완료한 세션은 이탈로 세지 않는다 (화면 unmount가 완료 뒤에 와도)", async () => {
    const session = startPractice("checkin", "acting", "acting");
    await settle();
    completePractice(session);
    abandonPractice(session);
    await settle();

    expect(queue().filter((e) => e.event === "practice_abandoned")).toHaveLength(0);
    expect(queue().filter((e) => e.event === "practice_completed")).toHaveLength(1);
  });

  it("이탈한 세션을 또 이탈시켜도 1건", async () => {
    const session = startPractice("duet", "hamlet-1", "acting");
    await settle();
    abandonPractice(session);
    abandonPractice(session);
    await settle();

    expect(queue().filter((e) => e.event === "practice_abandoned")).toHaveLength(1);
  });

  it("이탈한 세션을 초안으로 이어받아 저장하면 완료로 다시 열린다", async () => {
    const session = startPractice("text", null, "acting");
    await settle();
    abandonPractice(session);
    await settle();

    completePractice(resumePractice(session.sessionId, "text", null, "acting"));
    await settle();
    expect(queue().filter((e) => e.event === "practice_completed")).toHaveLength(1);
  });

  it("이탈은 기기 연습 기록에 남기지 않는다 (요약·연속 기록은 완료만 센다)", async () => {
    const session = startPractice("duet", "hamlet-1", "acting");
    await settle();
    abandonPractice(session);
    await settle();
    await expect(getPracticeLog()).resolves.toEqual([]);
  });
});

describe("practiceService — 소요 시간(elapsedMs)", () => {
  beforeEach(() => {
    Object.keys(AsyncStorage.__store).forEach((k) => delete AsyncStorage.__store[k]);
    global.fetch = offline();
  });

  it("완료·이탈에 세션 시작부터의 경과 시간이 정수로 실린다", async () => {
    const now = Date.now();
    const spy = jest.spyOn(Date, "now").mockReturnValue(now);
    const done = startPractice("text", null, "acting");
    const left = startPractice("video", null, "acting");
    spy.mockReturnValue(now + 4500);
    completePractice(done);
    abandonPractice(left);
    await settle();
    spy.mockRestore();

    const byEvent = Object.fromEntries(queue().map((e) => [e.event, e]));
    expect(byEvent.practice_completed.elapsedMs).toBe(4500);
    expect(byEvent.practice_abandoned.elapsedMs).toBe(4500);
    expect(byEvent.practice_started.elapsedMs).toBeUndefined();
  });

  it("시작 시각을 모르는 이어받은 세션에는 붙이지 않는다 (서버는 없어도 받는다)", async () => {
    completePractice(resumePractice("22222222-2222-4222-8222-222222222222", "text", null, "acting"));
    await settle();
    expect(queue()[0]).not.toHaveProperty("elapsedMs");
  });

  it("화면을 하루 넘게 열어 두어도 완료·이탈 이벤트는 시간만 생략하고 보존한다", async () => {
    const done = startPractice("text", null, "acting");
    const left = startPractice("video", null, "acting");
    done.startedAt -= 25 * 60 * 60 * 1000;
    left.startedAt -= 25 * 60 * 60 * 1000;
    await completePractice(done);
    await abandonPractice(left);
    await settle();

    const closed = queue().filter((e) => e.event !== "practice_started");
    expect(closed).toHaveLength(2);
    closed.forEach((e) => expect(e).not.toHaveProperty("elapsedMs"));
  });

  it.each([-1, 86400001, Infinity, NaN, 1.5])("잘못된 경과 시간 %s를 명시해도 서버를 막지 않는다", async (elapsedMs) => {
    const session = startPractice("text", null, "acting");
    await completePractice(session, { elapsedMs });
    await settle();
    expect(queue().find((e) => e.event === "practice_completed")).not.toHaveProperty("elapsedMs");
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

  it("400 invalid event는 서버가 지목한 잘못된 이벤트를 버리고 진행한다", async () => {
    const session = startPractice("text", null, "acting");
    await settle();
    expect(queue()).toHaveLength(1);

    global.fetch = jest.fn(async () => ({ ok: false, status: 400, json: async () => ({ error: "invalid event", index: 0 }) }));
    const result = await flushPracticeQueue();

    expect(queue()).toHaveLength(0); // 버려졌다 — 다음에도 똑같이 재전송되지 않는다
    expect(result.sent).toBe(0); // 버린 건 "보낸 것"으로 세지 않는다
  });

  it("401은 토큰 문제일 수 있어 버리지 않고 큐에 남긴다", async () => {
    const session = startPractice("text", null, "acting");
    await settle();

    global.fetch = jest.fn(async () => ({ ok: false, status: 401 }));
    const result = await flushPracticeQueue();

    expect(queue()).toHaveLength(1);
    expect(result.sent).toBe(0);
  });

  it("50건 중 1건이 잘못돼도 나머지 49건과 다음 배치는 정상 전송한다", async () => {
    const many = [];
    for (let i = 0; i < 60; i++) {
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

    let call = 0;
    global.fetch = jest.fn(async () => {
      call += 1;
      if (call === 1) return { ok: false, status: 400, json: async () => ({ error: "invalid event", index: 17 }) };
      return { ok: true, status: 200 };
    });

    const result = await flushPracticeQueue();

    expect(global.fetch).toHaveBeenCalledTimes(3);
    expect(result.sent).toBe(59);
    const retried = global.fetch.mock.calls.slice(1).flatMap(([, request]) => JSON.parse(request.body).events);
    expect(retried.some((e) => e.clientEventId === "e-17")).toBe(false);
    expect(new Set(retried.map((e) => e.clientEventId)).size).toBe(59);
    expect(queue()).toHaveLength(0);
  });

  it.each([400, 403, 405, 429])("원인이 특정되지 않은 HTTP %s에서는 정상 큐를 버리지 않는다", async (status) => {
    startPractice("text", null, "acting");
    await settle();
    const pending = queue();
    global.fetch = jest.fn(async () => ({ ok: false, status, json: async () => ({ error: "unavailable" }) }));

    await expect(flushPracticeQueue()).resolves.toEqual({ sent: 0 });
    expect(queue()).toEqual(pending);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("구버전이 저장한 24시간 초과 시간은 보내기 전에 생략한다", async () => {
    AsyncStorage.__store[PRACTICE_QUEUE_KEY] = JSON.stringify([
      { clientEventId: "legacy-long", elapsedMs: 90000000 },
      { clientEventId: "normal", elapsedMs: 86400000 },
    ]);
    global.fetch = online();

    await expect(flushPracticeQueue()).resolves.toEqual({ sent: 2 });
    const sent = JSON.parse(global.fetch.mock.calls[0][1].body).events;
    expect(sent[0]).not.toHaveProperty("elapsedMs");
    expect(sent[1].elapsedMs).toBe(86400000);
    expect(queue()).toHaveLength(0);
  });

  it("400 응답을 기다리는 동안 추가된 이벤트도 보존해서 다시 보낸다", async () => {
    AsyncStorage.__store[PRACTICE_QUEUE_KEY] = JSON.stringify([
      { clientEventId: "good-a" }, { clientEventId: "bad" }, { clientEventId: "good-b" },
    ]);
    let rejectBadEvent;
    global.fetch = online().mockImplementationOnce(() => new Promise((resolve) => {
      rejectBadEvent = () => resolve({ ok: false, status: 400, json: async () => ({ error: "invalid event", index: 1 }) });
    }));
    const flushing = flushPracticeQueue();
    await settle();
    const newSession = startPractice("text", null, "acting");
    await settle();
    rejectBadEvent();

    await expect(flushing).resolves.toEqual({ sent: 3 });
    const retried = JSON.parse(global.fetch.mock.calls[1][1].body).events;
    expect(retried.map((e) => e.clientEventId)).toEqual(expect.arrayContaining(["good-a", "good-b"]));
    expect(retried.some((e) => e.sessionId === newSession.sessionId)).toBe(true);
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

describe("practiceService — 기기 로컬 연습 기록", () => {
  beforeEach(() => {
    Object.keys(AsyncStorage.__store).forEach((k) => delete AsyncStorage.__store[k]);
    global.fetch = offline();
  });

  it("완료한 세션만 한 번씩 남고, 내용은 남기지 않는다", async () => {
    const duet = startPractice("duet", "hamlet-1", "acting");
    const opened = startPractice("text", null, "acting"); // 시작만 하고 끝내지 않은 연습
    await settle();
    completePractice(duet);
    completePractice(duet); // 중복 완료
    await settle();
    const log = await getPracticeLog();
    expect(log).toHaveLength(1);
    expect(log[0]).toEqual(expect.objectContaining({ sessionId: duet.sessionId, kind: "duet", field: "acting" }));
    expect(Object.keys(log[0]).sort()).toEqual(["at", "field", "kind", "sessionId"]);
    expect(log.some((e) => e.sessionId === opened.sessionId)).toBe(false);
  });

  it("완료 직후 바로 읽어도 방금 연습이 들어 있다 (홈으로 즉시 돌아가는 경우)", async () => {
    const duet = startPractice("duet", "hamlet-1", "acting");
    completePractice(duet); // 기다리지 않고
    const log = await getPracticeLog(); // 곧바로 읽는다
    expect(log.map((e) => e.sessionId)).toContain(duet.sessionId);
  });

  it("저장소가 깨져 있으면 빈 배열", async () => {
    AsyncStorage.__store[PRACTICE_LOG_KEY] = "{broken";
    await expect(getPracticeLog()).resolves.toEqual([]);
  });
});
