// 계정 삭제 화면 흐름 — 완료는 서버가 complete를 준 경우만, 실패는 재시도 버튼,
// 서버가 지우지 못한 항목은 안내에 그대로 노출.
import React from "react";
import { Alert } from "react-native";
import { render, fireEvent, waitFor } from "@testing-library/react-native";
import ProfileScreen from "../ProfileScreen";
import { useApp } from "../../context/AppContext";

jest.mock("react-i18next", () => ({ useTranslation: () => ({ t: (k) => k, i18n: { language: "ko" } }) }));
jest.mock("../../context/AppContext", () => ({ useApp: jest.fn() }));
jest.mock("react-native-safe-area-context", () => {
  const RN = require("react-native");
  return { SafeAreaView: RN.View };
});
jest.mock("../../components/PremiumBadge", () => () => null);

const buildNavigation = () => ({ navigate: jest.fn() });
let handleDeleteAccount;
const alerts = () => Alert.alert.mock.calls;
const pressButton = (call, text) => call[2].find((b) => b.text === text).onPress();

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, "alert").mockImplementation(() => {});
  handleDeleteAccount = jest.fn();
  useApp.mockReturnValue({
    userProfile: { name: "차서원", authUserId: "A" },
    savedNotes: [],
    artistProfile: { primaryField: "acting", displayName: "차서원", displayFields: "", noteScore: 0, aiScore: 0, diversityScore: 0, depthScore: 0, consistencyScore: 0, overallScore: 0, aiAnalyzedCount: 0, streak: 0 },
    handleSubmitFeedback: jest.fn(), handleDeleteAccount, handleLogout: jest.fn(), showToast: jest.fn(),
    isKoreanLocale: true, language: "ko", handleChangeLanguage: jest.fn(), setAuthState: jest.fn(),
    premium: { active: false }, legacyRecordsPending: false,
  });
});

const startDelete = (utils) => {
  fireEvent.press(utils.getByText("profile.delete_account"));
  pressButton(alerts()[0], "common.delete");
};

it("서버 삭제가 끝나면 삭제 완료와 제외 목록을 함께 안내한다", async () => {
  handleDeleteAccount.mockResolvedValue({ deleted: {}, excludes: ["training_data", "guest_media_archive"] });
  const utils = render(<ProfileScreen navigation={buildNavigation()} />);
  startDelete(utils);
  await waitFor(() => expect(alerts()).toHaveLength(2));
  expect(alerts()[1][0]).toBe("profile.delete_done_title");
  expect(alerts()[1][1]).toContain("profile.delete_excluded");
  expect(alerts()[1][1]).toContain("profile.delete_exclude_training");
  expect(alerts()[1][1]).toContain("profile.delete_exclude_guest_media");
});

it("삭제 실패는 남은 항목과 다시 시도 버튼을 보여 주고, 재시도는 같은 API를 다시 부른다", async () => {
  handleDeleteAccount.mockRejectedValueOnce(Object.assign(new Error("ACCOUNT_DELETE_INCOMPLETE"), { failed: ["media_archive"], retryable: true }));
  const utils = render(<ProfileScreen navigation={buildNavigation()} />);
  startDelete(utils);
  await waitFor(() => expect(alerts()).toHaveLength(2));
  expect(alerts()[1][0]).not.toBe("profile.delete_done_title");
  // 서버가 주는 영문 코드(media_archive)가 아니라 사람이 읽는 문구로 보여야 한다
  expect(alerts()[1][1]).toContain("profile.delete_part_media");
  expect(alerts()[1][1]).not.toContain("media_archive");

  handleDeleteAccount.mockResolvedValueOnce({ deleted: {}, excludes: [] });
  pressButton(alerts()[1], "common.retry");
  await waitFor(() => expect(handleDeleteAccount).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(alerts()[2][0]).toBe("profile.delete_done_title"));
});

it("로그인하지 않았으면 로그인 안내만 하고 완료로 표시하지 않는다", async () => {
  handleDeleteAccount.mockRejectedValue(new Error("ACCOUNT_DELETION_REQUIRES_LOGIN"));
  const utils = render(<ProfileScreen navigation={buildNavigation()} />);
  startDelete(utils);
  await waitFor(() => expect(alerts()).toHaveLength(2));
  expect(alerts()[1][1]).toBe("profile.delete_login_required");
});

it("소유자 불명 기록 안내는 복구 화면으로 들어간다", () => {
  useApp.mockReturnValue({ ...useApp(), legacyRecordsPending: true });
  const navigation = buildNavigation();
  const utils = render(<ProfileScreen navigation={navigation} />);
  fireEvent.press(utils.getByText("profile.legacy_records_open"));
  expect(navigation.navigate).toHaveBeenCalledWith("LegacyRecovery");
});
