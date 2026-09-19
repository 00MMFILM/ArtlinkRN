// 항목8: 공유·저장이 "추후 업데이트에서 지원됩니다" 스텁이던 문제.
// 공유는 shareCardImage로 실제 캡처·공유하게 하고, 이미지 저장 버튼은(앨범 저장 권한 이슈로) 제거한다.
import React from "react";
import { Alert } from "react-native";
import { render, fireEvent, waitFor } from "@testing-library/react-native";
import ShareCardScreen from "../ShareCardScreen";
import { useApp } from "../../context/AppContext";
import { shareCardImage } from "../../utils/shareCard";

jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k) => k, i18n: { language: "ko" } }),
}));
jest.mock("../../context/AppContext", () => ({ useApp: jest.fn() }));
jest.mock("../../utils/shareCard", () => ({ shareCardImage: jest.fn() }));
jest.mock("react-native-safe-area-context", () => {
  const RN = require("react-native");
  return { SafeAreaView: RN.View };
});
jest.mock("../../components/TopBar", () => {
  const React = require("react");
  const RN = require("react-native");
  return ({ left }) => React.createElement(RN.View, null, left);
});

const navigation = { goBack: jest.fn() };

const buildCtx = () => ({
  artistProfile: {
    radarLabels: ["집중력", "표현력", "발성"],
    radarValues: [80, 70, 60],
    overallScore: 75,
    weekGrowth: 3,
    aiAnalyzedCount: 5,
    streak: 4,
    displayName: "차서원",
    displayFields: "연기",
    primaryField: "acting",
    topTags: [["독백", 3]],
    level: 2,
  },
  userProfile: { name: "차서원" },
  savedNotes: [{ createdAt: new Date().toISOString() }],
});

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, "alert").mockImplementation(() => {});
  useApp.mockReturnValue(buildCtx());
});

describe("ShareCardScreen — 공유 실제 구현", () => {
  it("이미지 저장 버튼은 더 이상 없다", () => {
    const utils = render(<ShareCardScreen navigation={navigation} />);
    expect(utils.queryByText("shareCard.save_image")).toBeNull();
  });

  it("공유하기를 누르면 shareCardImage로 카드 뷰를 캡처·공유한다", async () => {
    shareCardImage.mockResolvedValue({ shared: true });
    const utils = render(<ShareCardScreen navigation={navigation} />);
    fireEvent.press(utils.getByText("shareCard.share"));
    await waitFor(() => expect(shareCardImage).toHaveBeenCalledTimes(1));
    expect(shareCardImage.mock.calls[0][0]).toHaveProperty("current");
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it("공유 불가(reason: unavailable)면 실패 안내를 띄운다", async () => {
    shareCardImage.mockResolvedValue({ shared: false, reason: "unavailable" });
    const utils = render(<ShareCardScreen navigation={navigation} />);
    fireEvent.press(utils.getByText("shareCard.share"));
    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith("common.error", "noteDetail.share_failed")
    );
  });

  it("캡처 중 예외가 나도 실패 안내를 띄운다", async () => {
    shareCardImage.mockRejectedValue(new Error("capture failed"));
    const utils = render(<ShareCardScreen navigation={navigation} />);
    fireEvent.press(utils.getByText("shareCard.share"));
    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith("common.error", "noteDetail.share_failed")
    );
  });
});
