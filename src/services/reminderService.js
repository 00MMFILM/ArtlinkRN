// 연습 리마인더 — 첫 AI 피드백 직후 딱 한 번 제안하고,
// 수락 시 "그 시각"에 매일 로컬 알림. (Calm 패턴: 첫 성공 경험 직후가 설정률 최고 시점)
import * as Notifications from "expo-notifications";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Alert, Platform } from "react-native";

const ASKED_KEY = "artlink-reminder-asked";
const REMINDER_ID = "daily-practice-reminder";
const FIRST_NOTE_NUDGE_ID = "first-note-nudge";
const FIRST_NOTE_NUDGE_SECONDS = 48 * 60 * 60;

// 권한 조회가 늦게 끝나거나 네이티브 예약 중 취소해도 이전 예약이 되살아나지 않게 한다.
// 권한 조회는 큐 밖에서 하고, 실제 예약/취소만 순서대로 실행한다.
let firstNoteNudgeGeneration = 0;
let firstNoteNudgeChain = Promise.resolve();
function mutateFirstNoteNudge(fn) {
  const run = firstNoteNudgeChain.then(fn, fn);
  firstNoteNudgeChain = run.catch(() => {});
  return run;
}

// 앱이 포그라운드일 때도 알림 표시
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function hasAskedReminder() {
  try {
    return (await AsyncStorage.getItem(ASKED_KEY)) === "true";
  } catch {
    return false;
  }
}

export async function markReminderAsked() {
  try {
    await AsyncStorage.setItem(ASKED_KEY, "true");
  } catch {}
}

// 매일 (hour:minute)에 반복되는 연습 알림 등록. 성공 시 true.
export async function scheduleDailyPracticeReminder(hour, minute, title, body) {
  try {
    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== "granted") return false;

    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("practice-reminder", {
        name: "연습 리마인더",
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }

    // 기존 리마인더 교체
    await Notifications.cancelScheduledNotificationAsync(REMINDER_ID).catch(() => {});

    await Notifications.scheduleNotificationAsync({
      identifier: REMINDER_ID,
      content: {
        title,
        body,
        ...(Platform.OS === "android" ? { channelId: "practice-reminder" } : {}),
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour,
        minute,
      },
    });
    return true;
  } catch (e) {
    console.log("[reminder] schedule failed:", e?.message);
    return false;
  }
}

// 첫 기록 직후 한 번만 묻는다 (1.11.10). 알림 권한을 묻는 곳이 "새 노트 화면의 첫 AI 피드백 직후" 하나뿐이라
// 체크인으로 시작한 신규 사용자는 권한을 받을 기회가 없었고, 다시 부를 수단이 없었다.
// 수락하면 지금 이 시각에 매일 알린다. 이미 물어본 기기에는 다시 묻지 않는다.
export async function offerPracticeReminder(t, onSet) {
  if (await hasAskedReminder()) return false;
  await markReminderAsked();
  const now = new Date();
  const hour = now.getHours();
  const minute = now.getMinutes();
  const time = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  Alert.alert(t("reminder.offer_title"), t("reminder.offer_msg", { time }), [
    { text: t("reminder.offer_no"), style: "cancel" },
    {
      text: t("reminder.offer_yes"),
      onPress: async () => {
        const ok = await scheduleDailyPracticeReminder(hour, minute, t("reminder.push_title"), t("reminder.push_body"));
        if (ok && onSet) onSet();
      },
    },
  ]);
  return true;
}

// 프로필에서 끌 수 있게 — 켜져 있는지 확인하고 끈다. (전에는 OS 설정에서만 끌 수 있었다)
export async function isDailyReminderOn() {
  try {
    const all = await Notifications.getAllScheduledNotificationsAsync();
    return all.some((n) => n.identifier === REMINDER_ID);
  } catch {
    return false;
  }
}

export async function cancelDailyPracticeReminder() {
  try {
    await Notifications.cancelScheduledNotificationAsync(REMINDER_ID);
    return true;
  } catch {
    return false;
  }
}

// 가입 48시간 뒤 노트가 아직 0건인 사람을 부르는 로컬 알림 1회 (1.11.8).
// 서버 푸시가 없어 로컬 예약으로 한다. 권한을 새로 묻지는 않는다 — 가입 직후 권한 팝업은
// 그 자체가 이탈 요인이라, 이미 허용한 사람에게만 건다.
export async function scheduleFirstNoteNudge(title, body) {
  const generation = ++firstNoteNudgeGeneration;
  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== "granted" || generation !== firstNoteNudgeGeneration) return false;

    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("practice-reminder", {
        name: "연습 리마인더",
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }

    return await mutateFirstNoteNudge(async () => {
      if (generation !== firstNoteNudgeGeneration) return false;
      await Notifications.cancelScheduledNotificationAsync(FIRST_NOTE_NUDGE_ID);
      if (generation !== firstNoteNudgeGeneration) return false;

      await Notifications.scheduleNotificationAsync({
        identifier: FIRST_NOTE_NUDGE_ID,
        content: {
          title,
          body,
          ...(Platform.OS === "android" ? { channelId: "practice-reminder" } : {}),
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
          seconds: FIRST_NOTE_NUDGE_SECONDS,
        },
      });
      // 진행 중 취소가 들어왔으면 바로 다음 큐 작업에서 네이티브 예약도 지운다.
      return generation === firstNoteNudgeGeneration;
    });
  } catch (e) {
    console.log("[reminder] first-note nudge failed:", e?.message);
    return false;
  }
}

// 첫 노트를 남겼거나(어떤 경로든) 로그아웃·탈퇴하면 예약을 지운다.
export async function cancelFirstNoteNudge() {
  ++firstNoteNudgeGeneration;
  try {
    await mutateFirstNoteNudge(() => Notifications.cancelScheduledNotificationAsync(FIRST_NOTE_NUDGE_ID));
    return true;
  } catch (e) {
    return false;
  }
}
