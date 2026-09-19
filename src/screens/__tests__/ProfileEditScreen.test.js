// 프로필 편집 화면에 이탈 경고가 없던 문제 — NoteCreateScreen/CommunityPostCreateScreen과 같은
// beforeRemove + 변경 여부 가드를 추가한다. 저장으로 나갈 때는 경고가 뜨면 안 된다.
import React from "react";
import { Alert } from "react-native";
import { render, fireEvent, act } from "@testing-library/react-native";
import ProfileEditScreen from "../ProfileEditScreen";
import { useApp } from "../../context/AppContext";

jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k) => k, i18n: { language: "ko" } }),
}));
jest.mock("../../context/AppContext", () => ({ useApp: jest.fn() }));
jest.mock("../../services/dataCollectionService", () => ({ withdrawMediaConsent: jest.fn() }));
jest.mock("expo-image-picker", () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));
jest.mock("react-native-safe-area-context", () => {
  const RN = require("react-native");
  return { SafeAreaView: RN.View };
});
jest.mock("../../components/TopBar", () => {
  const React = require("react");
  const RN = require("react-native");
  return ({ left, right }) => React.createElement(RN.View, null, left, right);
});

const buildNavigation = () => ({
  goBack: jest.fn(),
  addListener: jest.fn(() => jest.fn()),
});

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, "alert").mockImplementation(() => {});
  useApp.mockReturnValue({
    userProfile: { name: "차서원", bio: "" },
    handleUpdateProfile: jest.fn(),
    dataConsent: false,
    handleSetDataConsent: jest.fn(),
  });
});

describe("ProfileEditScreen — 이탈 경고", () => {
  it("아무것도 바꾸지 않고 취소하면 경고 없이 바로 나간다", () => {
    const navigation = buildNavigation();
    const utils = render(<ProfileEditScreen navigation={navigation} />);
    fireEvent.press(utils.getByText("common.cancel"));
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(navigation.goBack).toHaveBeenCalled();
  });

  it("이름을 바꾸고 취소하면 이탈 확인 경고가 뜬다", () => {
    const navigation = buildNavigation();
    const utils = render(<ProfileEditScreen navigation={navigation} />);
    fireEvent.changeText(utils.getByPlaceholderText("profileEdit.name_placeholder"), "새 이름");
    fireEvent.press(utils.getByText("common.cancel"));
    expect(Alert.alert).toHaveBeenCalledWith(
      "common.discard_title",
      "common.discard_message",
      expect.any(Array)
    );
    expect(navigation.goBack).not.toHaveBeenCalled();
  });

  it("저장으로 나갈 때는 경고가 뜨지 않는다", () => {
    const navigation = buildNavigation();
    const ctx = {
      userProfile: { name: "차서원", bio: "" },
      handleUpdateProfile: jest.fn(),
      dataConsent: false,
      handleSetDataConsent: jest.fn(),
    };
    useApp.mockReturnValue(ctx);
    const utils = render(<ProfileEditScreen navigation={navigation} />);
    fireEvent.changeText(utils.getByPlaceholderText("profileEdit.name_placeholder"), "새 이름");
    fireEvent.press(utils.getByText("common.save"));

    expect(ctx.handleUpdateProfile).toHaveBeenCalledTimes(1);
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(navigation.goBack).toHaveBeenCalled();
  });

  it("변경 후 하드웨어 뒤로가기(beforeRemove)에도 경고가 뜬다", () => {
    const navigation = buildNavigation();
    const utils = render(<ProfileEditScreen navigation={navigation} />);
    fireEvent.changeText(utils.getByPlaceholderText("profileEdit.name_placeholder"), "새 이름");

    const beforeRemoveHandler = navigation.addListener.mock.calls.find((c) => c[0] === "beforeRemove")[1];
    const preventDefault = jest.fn();
    const dispatch = jest.fn();
    navigation.dispatch = dispatch;
    act(() => {
      beforeRemoveHandler({ preventDefault, data: { action: { type: "GO_BACK" } } });
    });

    expect(preventDefault).toHaveBeenCalled();
    expect(Alert.alert).toHaveBeenCalledWith(
      "common.discard_title",
      "common.discard_message",
      expect.any(Array)
    );
  });
});
