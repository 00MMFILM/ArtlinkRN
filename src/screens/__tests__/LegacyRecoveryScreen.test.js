// 소유자 불명 구버전 기록 복구 화면 — 요약을 보여 주고, 사용자가 명시적으로
// 확인해야만 현재 로그인 계정으로 옮긴다. 그대로 두는 선택지도 있어야 한다.
import React from "react";
import { Alert } from "react-native";
import { render, fireEvent, waitFor } from "@testing-library/react-native";
import LegacyRecoveryScreen from "../LegacyRecoveryScreen";
import { useApp } from "../../context/AppContext";
import { summarizeUnassignedLegacyData } from "../../utils/accountStorage";

jest.mock("react-i18next", () => ({ useTranslation: () => ({ t: (k) => k, i18n: { language: "ko" } }) }));
jest.mock("../../context/AppContext", () => ({ useApp: jest.fn() }));
jest.mock("../../utils/accountStorage", () => ({ summarizeUnassignedLegacyData: jest.fn() }));
jest.mock("react-native-safe-area-context", () => {
  const RN = require("react-native");
  return { SafeAreaView: RN.View };
});

const buildNavigation = () => ({ goBack: jest.fn(), navigate: jest.fn() });
let handleClaimLegacyRecords;

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, "alert").mockImplementation(() => {});
  handleClaimLegacyRecords = jest.fn(async () => {});
  summarizeUnassignedLegacyData.mockResolvedValue({ notes: 3, portfolioItems: 1, from: "2026-05-01T00:00:00.000Z", to: "2026-06-10T00:00:00.000Z" });
  useApp.mockReturnValue({ userProfile: { authUserId: "A" }, handleClaimLegacyRecords });
});

it("기기에 남은 기록 요약을 보여 준다", async () => {
  const utils = render(<LegacyRecoveryScreen navigation={buildNavigation()} />);
  await waitFor(() => utils.getByText("legacyRecovery.summary_notes"));
  expect(utils.getByText("legacyRecovery.summary_portfolio")).toBeTruthy();
  expect(utils.getByText("legacyRecovery.summary_period")).toBeTruthy();
});

it("확인하지 않으면 옮기기 버튼이 동작하지 않는다", async () => {
  const utils = render(<LegacyRecoveryScreen navigation={buildNavigation()} />);
  await waitFor(() => utils.getByText("legacyRecovery.summary_notes"));
  fireEvent.press(utils.getByText("legacyRecovery.move"));
  expect(handleClaimLegacyRecords).not.toHaveBeenCalled();
});

it("명시적으로 확인하면 현재 계정으로 옮긴다", async () => {
  const utils = render(<LegacyRecoveryScreen navigation={buildNavigation()} />);
  await waitFor(() => utils.getByText("legacyRecovery.summary_notes"));
  expect(utils.getByText("legacyRecovery.confirm_label")).toBeTruthy();
  fireEvent(utils.UNSAFE_getByType(require("react-native").Switch), "valueChange", true);
  fireEvent.press(utils.getByText("legacyRecovery.move"));
  await waitFor(() => expect(handleClaimLegacyRecords).toHaveBeenCalled());
});

it("그대로 두기는 아무것도 옮기지 않고 화면을 닫는다", async () => {
  const navigation = buildNavigation();
  const utils = render(<LegacyRecoveryScreen navigation={navigation} />);
  await waitFor(() => utils.getByText("legacyRecovery.summary_notes"));
  fireEvent.press(utils.getByText("legacyRecovery.keep"));
  expect(handleClaimLegacyRecords).not.toHaveBeenCalled();
  expect(navigation.goBack).toHaveBeenCalled();
});

it("로그인하지 않았으면 옮기지 않고 로그인 안내를 보여 준다", async () => {
  useApp.mockReturnValue({ userProfile: {}, handleClaimLegacyRecords });
  const utils = render(<LegacyRecoveryScreen navigation={buildNavigation()} />);
  await waitFor(() => utils.getByText("legacyRecovery.summary_notes"));
  expect(utils.getByText("legacyRecovery.login_required")).toBeTruthy();
  fireEvent(utils.UNSAFE_getByType(require("react-native").Switch), "valueChange", true);
  fireEvent.press(utils.getByText("legacyRecovery.move"));
  expect(handleClaimLegacyRecords).not.toHaveBeenCalled();
});
