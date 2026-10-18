import AsyncStorage from "@react-native-async-storage/async-storage";

// 게스트 가입 유도는 기기당 딱 1회 — 새 노트 화면·노트 상세가 같은 표시를 쓴다
const SIGNUP_NUDGE_KEY = "artlink-signup-nudge-asked";

export async function hasAskedSignupNudge() {
  try {
    return (await AsyncStorage.getItem(SIGNUP_NUDGE_KEY)) === "true";
  } catch {
    return false;
  }
}

export async function markSignupNudgeAsked() {
  try {
    await AsyncStorage.setItem(SIGNUP_NUDGE_KEY, "true");
  } catch {}
}
