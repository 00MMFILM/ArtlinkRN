import * as Notifications from "expo-notifications";
import { Alert } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { scheduleFirstNoteNudge, cancelFirstNoteNudge, offerPracticeReminder, isDailyReminderOn, cancelDailyPracticeReminder } from "../reminderService";

jest.mock("expo-notifications", () => ({
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn(async () => ({ status: "granted" })),
  requestPermissionsAsync: jest.fn(async () => ({ status: "granted" })),
  scheduleNotificationAsync: jest.fn(async () => "scheduled"),
  cancelScheduledNotificationAsync: jest.fn(async () => {}),
  getAllScheduledNotificationsAsync: jest.fn(async () => []),
  setNotificationChannelAsync: jest.fn(async () => {}),
  SchedulableTriggerInputTypes: { DAILY: "daily", TIME_INTERVAL: "timeInterval" },
  AndroidImportance: { DEFAULT: 3 },
}));
jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => {}),
}));

describe("reminderService — 가입 48시간 노트 0건 넛지", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Notifications.getPermissionsAsync.mockResolvedValue({ status: "granted" });
    Notifications.scheduleNotificationAsync.mockResolvedValue("scheduled");
    Notifications.cancelScheduledNotificationAsync.mockResolvedValue(undefined);
  });

  it("권한이 있으면 48시간 뒤 1회, 고정 identifier로 예약한다", async () => {
    await expect(scheduleFirstNoteNudge("제목", "본문")).resolves.toBe(true);

    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
    const arg = Notifications.scheduleNotificationAsync.mock.calls[0][0];
    expect(arg.identifier).toBe("first-note-nudge");
    expect(arg.content).toEqual(expect.objectContaining({ title: "제목", body: "본문" }));
    expect(arg.trigger).toEqual({ type: "timeInterval", seconds: 48 * 60 * 60 });
  });

  // 가입 직후 권한 팝업은 그 자체가 이탈 요인 — 이미 허용한 사람에게만 건다
  it("권한이 없으면 예약하지 않고 권한을 새로 묻지도 않는다", async () => {
    Notifications.getPermissionsAsync.mockResolvedValueOnce({ status: "undetermined" });

    await expect(scheduleFirstNoteNudge("제목", "본문")).resolves.toBe(false);

    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it("예약 전에 같은 identifier의 기존 예약을 지운다 (재가입해도 1건)", async () => {
    await scheduleFirstNoteNudge("제목", "본문");
    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith("first-note-nudge");
  });

  it("예약이 실패해도 던지지 않고 false", async () => {
    Notifications.scheduleNotificationAsync.mockRejectedValueOnce(new Error("no"));
    await expect(scheduleFirstNoteNudge("제목", "본문")).resolves.toBe(false);
  });

  it("취소는 같은 identifier를 지운다", async () => {
    await expect(cancelFirstNoteNudge()).resolves.toBe(true);
    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith("first-note-nudge");
  });

  it("취소가 실패해도 던지지 않는다", async () => {
    Notifications.cancelScheduledNotificationAsync.mockRejectedValueOnce(new Error("no"));
    await expect(cancelFirstNoteNudge()).resolves.toBe(false);
  });

  it("권한 조회 중 첫 기록을 저장하면 늦게 도착한 권한 응답이 알림을 만들지 않는다", async () => {
    let resolvePermission;
    Notifications.getPermissionsAsync.mockImplementationOnce(() => new Promise((resolve) => { resolvePermission = resolve; }));
    const scheduling = scheduleFirstNoteNudge("옛 계정", "본문");

    await expect(cancelFirstNoteNudge()).resolves.toBe(true);
    resolvePermission({ status: "granted" });

    await expect(scheduling).resolves.toBe(false);
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it("네이티브 예약 중 로그아웃하면 예약이 끝난 뒤 취소되어 알림이 남지 않는다", async () => {
    let finishSchedule;
    let active = false;
    Notifications.scheduleNotificationAsync.mockImplementationOnce(() => new Promise((resolve) => {
      finishSchedule = () => { active = true; resolve("scheduled"); };
    }));
    Notifications.cancelScheduledNotificationAsync.mockImplementation(async () => { active = false; });

    const scheduling = scheduleFirstNoteNudge("제목", "본문");
    await new Promise((resolve) => setImmediate(resolve));
    const cancelling = cancelFirstNoteNudge();
    finishSchedule();

    await expect(scheduling).resolves.toBe(false);
    await expect(cancelling).resolves.toBe(true);
    expect(active).toBe(false);
  });

  it("이전 계정의 예약·취소가 겹쳐도 그 뒤 새 계정의 예약은 지우지 않는다", async () => {
    let finishOldSchedule;
    let activeTitle = null;
    Notifications.scheduleNotificationAsync.mockImplementation(async ({ content }) => { activeTitle = content.title; });
    Notifications.scheduleNotificationAsync.mockImplementationOnce(({ content }) => new Promise((resolve) => {
      finishOldSchedule = () => { activeTitle = content.title; resolve("scheduled"); };
    }));
    Notifications.cancelScheduledNotificationAsync.mockImplementation(async () => { activeTitle = null; });

    const oldSchedule = scheduleFirstNoteNudge("이전 계정", "본문");
    await new Promise((resolve) => setImmediate(resolve));
    const cancelling = cancelFirstNoteNudge();
    const newSchedule = scheduleFirstNoteNudge("새 계정", "본문");
    finishOldSchedule();

    await expect(Promise.all([oldSchedule, cancelling, newSchedule])).resolves.toEqual([false, true, true]);
    expect(activeTitle).toBe("새 계정");
  });
});

describe("reminderService — 첫 기록 직후 제안 · 끄기", () => {
  const t = (k) => k;
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, "alert").mockImplementation(() => {});
    AsyncStorage.getItem.mockResolvedValue(null);
    Notifications.requestPermissionsAsync.mockResolvedValue({ status: "granted" });
  });

  it("처음이면 물어보고, 수락하면 지금 시각에 매일 알림을 건다", async () => {
    const onSet = jest.fn();
    await expect(offerPracticeReminder(t, onSet)).resolves.toBe(true);
    expect(AsyncStorage.setItem).toHaveBeenCalledWith("artlink-reminder-asked", "true");
    const buttons = Alert.alert.mock.calls[0][2];
    await buttons.find((b) => b.text === "reminder.offer_yes").onPress();
    const arg = Notifications.scheduleNotificationAsync.mock.calls[0][0];
    expect(arg.identifier).toBe("daily-practice-reminder");
    expect(arg.trigger.type).toBe("daily");
    expect(onSet).toHaveBeenCalledTimes(1);
  });

  it("이미 물어본 기기에는 다시 묻지 않는다", async () => {
    AsyncStorage.getItem.mockResolvedValue("true");
    await expect(offerPracticeReminder(t)).resolves.toBe(false);
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it("권한을 거절하면 예약하지 않고 수락 기록도 남기지 않는다", async () => {
    Notifications.requestPermissionsAsync.mockResolvedValue({ status: "denied" });
    const onSet = jest.fn();
    await offerPracticeReminder(t, onSet);
    await Alert.alert.mock.calls[0][2].find((b) => b.text === "reminder.offer_yes").onPress();
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
    expect(onSet).not.toHaveBeenCalled();
  });

  it("켜짐 여부를 예약 목록에서 확인하고, 끄면 그 예약을 지운다", async () => {
    await expect(isDailyReminderOn()).resolves.toBe(false);
    Notifications.getAllScheduledNotificationsAsync.mockResolvedValue([{ identifier: "daily-practice-reminder" }]);
    await expect(isDailyReminderOn()).resolves.toBe(true);
    await expect(cancelDailyPracticeReminder()).resolves.toBe(true);
    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith("daily-practice-reminder");
  });
});
