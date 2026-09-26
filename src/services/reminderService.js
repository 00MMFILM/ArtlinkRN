// 연습 리마인더 — 첫 AI 피드백 직후 딱 한 번 제안하고,
// 수락 시 "그 시각"에 매일 로컬 알림. (Calm 패턴: 첫 성공 경험 직후가 설정률 최고 시점)
import * as Notifications from "expo-notifications";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

const ASKED_KEY = "artlink-reminder-asked";
const REMINDER_ID = "daily-practice-reminder";
const FIRST_NOTE_NUDGE_ID = "first-note-nudge";
const FIRST_NOTE_NUDGE_SECONDS = 48 * 60 * 60;

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

// 가입 48시간 뒤 노트가 아직 0건인 사람을 부르는 로컬 알림 1회 (1.11.8).
// 서버 푸시가 없어 로컬 예약으로 한다. 권한을 새로 묻지는 않는다 — 가입 직후 권한 팝업은
// 그 자체가 이탈 요인이라, 이미 허용한 사람에게만 건다.
export async function scheduleFirstNoteNudge(title, body) {
  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== "granted") return false;

    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("practice-reminder", {
        name: "연습 리마인더",
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }

    await Notifications.cancelScheduledNotificationAsync(FIRST_NOTE_NUDGE_ID).catch(() => {});

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
    return true;
  } catch (e) {
    console.log("[reminder] first-note nudge failed:", e?.message);
    return false;
  }
}

// 첫 노트를 남겼거나(어떤 경로든) 로그아웃·탈퇴하면 예약을 지운다.
export async function cancelFirstNoteNudge() {
  try {
    await Notifications.cancelScheduledNotificationAsync(FIRST_NOTE_NUDGE_ID);
    return true;
  } catch (e) {
    return false;
  }
}
