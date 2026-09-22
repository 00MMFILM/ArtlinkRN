// 반복 연습 측정 — "연습 한 번 = 세션 하나". 시작·완료·AI피드백이 같은 sessionId를 공유한다.
// 기존 trackFunnelEvent(기기당 최초 1회)는 그대로 두고, 반복은 여기서 append-only로 쌓는다.
//
// 담는 것: 기기 ID, 이벤트/종류, 세션·이벤트 UUID, 장면·노트 id(subjectKey), 분야, 시각, 앱버전/플랫폼/언어.
// 절대 담지 않는 것: 제목, 본문, 대사, 태그, 녹음·영상, 전사, AI 코멘트.
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import i18n from "i18next";
import { SERVER_URL, getApiHeaders } from "./apiConfig";
import { getOrCreateDeviceId } from "./mauService";

const APP_VERSION = require("../../app.json").expo.version;

export const PRACTICE_QUEUE_KEY = "artlink-practice-queue";
export const MAX_QUEUE = 200; // 넘치면 오래된 것부터 버린다
const BATCH_SIZE = 50; // 서버 1회 최대

const EVENTS = ["practice_started", "practice_completed", "ai_feedback_done"];
const KINDS = ["text", "video", "checkin", "duet", "reanalysis"];

// expo-crypto가 설치돼 있으면 쓰고, 없으면 Math.random 폴백 (새 패키지 추가 없음)
let Crypto = null;
try {
  Crypto = require("expo-crypto");
} catch (e) {
  Crypto = null;
}

export function newUuid() {
  if (Crypto && typeof Crypto.randomUUID === "function") {
    try {
      return Crypto.randomUUID();
    } catch (e) {}
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

const asKey = (v) => (v === null || v === undefined || v === "" ? null : String(v));

// AsyncStorage 읽고-고쳐-쓰기가 겹쳐 이벤트가 사라지지 않게 직렬화한다
let chain = Promise.resolve();
function serialize(fn) {
  const run = chain.then(fn, fn);
  chain = run.then(
    () => {},
    () => {}
  );
  return run;
}

async function readQueue() {
  try {
    const json = await AsyncStorage.getItem(PRACTICE_QUEUE_KEY);
    const parsed = json ? JSON.parse(json) : null;
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

async function writeQueue(queue) {
  try {
    await AsyncStorage.setItem(PRACTICE_QUEUE_KEY, JSON.stringify(queue));
  } catch (e) {}
}

async function enqueue(event, session, overrides = {}) {
  try {
    const kind = overrides.kind || session?.kind;
    if (!EVENTS.includes(event) || !KINDS.includes(kind) || !session?.sessionId) return false;
    const item = {
      clientEventId: newUuid(),
      sessionId: session.sessionId,
      event,
      kind,
      subjectKey: asKey("subjectKey" in overrides ? overrides.subjectKey : session.subjectKey),
      field: asKey("field" in overrides ? overrides.field : session.field),
      occurredAt: new Date().toISOString(),
      deviceId: await getOrCreateDeviceId(),
      language: i18n?.language || null,
      platform: Platform.OS,
      appVersion: APP_VERSION,
    };
    await serialize(async () => {
      const queue = await readQueue();
      queue.push(item);
      await writeQueue(queue.slice(-MAX_QUEUE));
    });
    flushPracticeQueue();
    return true;
  } catch (e) {
    return false;
  }
}

/** 연습 시작 — 세션 핸들을 돌려준다. 화면은 이걸 ref에 들고 있다가 완료 때 넘긴다. */
export function startPractice(kind, subjectKey = null, field = null) {
  const session = { sessionId: newUuid(), kind, subjectKey: asKey(subjectKey), field: asKey(field) };
  enqueue("practice_started", session);
  return session;
}

/** 이미 발급된 세션을 이어받는다 (초안 복원 — 가입 왕복이 연습 2회로 세이지 않게). */
export function resumePractice(sessionId, kind, subjectKey = null, field = null) {
  return { sessionId: String(sessionId), kind, subjectKey: asKey(subjectKey), field: asKey(field) };
}

/** 연습 완료. 완료 시점에야 알 수 있는 값(노트 id, 영상 여부)은 overrides로 채운다. */
// 한 세션의 완료는 한 번만 센다 — 2인 대사 화면이 완료한 세션을 노트 저장이 다시 완료해도 1회.
const completedSessions = new Set();
export function completePractice(session, overrides = {}) {
  const id = session?.sessionId;
  if (id) {
    if (completedSessions.has(id)) return Promise.resolve(false);
    completedSessions.add(id);
    if (completedSessions.size > 200) completedSessions.delete(completedSessions.values().next().value);
  }
  appendPracticeLog(session, overrides);
  return enqueue("practice_completed", session, overrides);
}

// ── 기기 로컬 연습 기록 ──
// 노트를 남기지 않는 연습(2인 대사 등)도 홈 요약·연속 기록에 잡히도록, 완료한 세션을 기기에 남긴다.
// 내용(대본·노트 본문)은 넣지 않는다. 대시보드는 노트와 같은 sessionId를 가진 기록을 중복으로 세지 않는다.
export const PRACTICE_LOG_KEY = "artlink-practice-log";
const MAX_LOG = 500;
function appendPracticeLog(session, overrides = {}) {
  if (!session?.sessionId) return;
  serialize(async () => {
    try {
      const raw = await AsyncStorage.getItem(PRACTICE_LOG_KEY);
      const log = raw ? JSON.parse(raw) : [];
      if (log.some((e) => e.sessionId === session.sessionId)) return;
      log.push({
        sessionId: session.sessionId,
        kind: overrides.kind || session.kind || null,
        field: overrides.field || session.field || null,
        at: new Date().toISOString(),
      });
      await AsyncStorage.setItem(PRACTICE_LOG_KEY, JSON.stringify(log.slice(-MAX_LOG)));
    } catch {}
  });
}

/** 완료한 연습 기록(오래된 순). 실패하면 빈 배열.
 *  진행 중인 기록 쓰기가 끝난 뒤에 읽는다 — "연습 끝"과 동시에 홈으로 돌아가도 방금 연습이 빠지지 않게. */
export function getPracticeLog() {
  return serialize(async () => {
    try {
      const raw = await AsyncStorage.getItem(PRACTICE_LOG_KEY);
      const log = raw ? JSON.parse(raw) : [];
      return Array.isArray(log) ? log : [];
    } catch {
      return [];
    }
  });
}

/** AI 피드백 완료 — 최초 1회가 아니라 매번 보낸다. */
export function aiFeedbackDone(session, kindOverride) {
  return enqueue("ai_feedback_done", session, kindOverride ? { kind: kindOverride } : {});
}

let flushing = false;

/**
 * 큐를 최대 50건씩 보낸다. 2xx면 그 건만 지우고 다음 배치로 진행한다.
 * 4xx(401 제외)는 재전송해도 같은 결과라 그 배치를 버리고 다음 배치로 진행한다.
 * 401(토큰 문제일 수 있음)·5xx·네트워크 오류는 큐에 그대로 두고 중단한다.
 */
export async function flushPracticeQueue() {
  if (flushing) return { sent: 0, busy: true };
  flushing = true;
  try {
    let sent = 0;
    for (;;) {
      const queue = await readQueue();
      if (queue.length === 0) break;
      const batch = queue.slice(0, BATCH_SIZE);
      let ok = false;
      let status = null;
      try {
        const res = await fetch(`${SERVER_URL}/api/practice-event`, {
          method: "POST",
          headers: getApiHeaders(),
          body: JSON.stringify({ events: batch }),
        });
        status = res?.status;
        ok = !!res && (typeof res.ok === "boolean" ? res.ok : status >= 200 && status < 300);
      } catch (e) {
        ok = false;
      }
      if (!ok) {
        const discardable4xx = status && status >= 400 && status < 500 && status !== 401;
        if (!discardable4xx) break; // 401·5xx·네트워크 오류는 큐에 남기고 중단
        const dropped = new Set(batch.map((e) => e.clientEventId));
        await serialize(async () => {
          const current = await readQueue();
          await writeQueue(current.filter((e) => !dropped.has(e.clientEventId)));
        });
        continue; // 이 배치는 버리고 다음 배치로
      }
      const posted = new Set(batch.map((e) => e.clientEventId));
      await serialize(async () => {
        const current = await readQueue();
        await writeQueue(current.filter((e) => !posted.has(e.clientEventId)));
      });
      sent += batch.length;
      if (queue.length <= BATCH_SIZE) break;
    }
    return { sent };
  } finally {
    flushing = false;
  }
}
