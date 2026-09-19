// 데모 데이터에 실존 연예인 실명·소속사·작품명이 들어있던 문제 + 통계 3종이 항상 "-"만 보이던 문제.
import React from "react";
import { render, waitFor } from "@testing-library/react-native";
import B2BDashboardScreen from "../B2BDashboardScreen";
import { useApp } from "../../context/AppContext";
import { fetchArtistProfiles } from "../../services/profileService";

jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k, opts) => (opts ? `${k}:${JSON.stringify(opts)}` : k), i18n: { language: "ko" } }),
}));
jest.mock("../../context/AppContext", () => ({ useApp: jest.fn() }));
jest.mock("../../services/profileService", () => ({ fetchArtistProfiles: jest.fn() }));
jest.mock("../../services/proposalService", () => ({ sendProposal: jest.fn() }));
jest.mock("expo-av", () => ({ Video: () => null, ResizeMode: { COVER: "cover" } }));
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

// 흔히 알려진 실존 연예인 이름·소속사·작품명 — 데모 데이터에 남아 있으면 안 된다
const REAL_NAMES = ["김수현", "이지은", "박서준", "최예나", "정호연", "한소희", "김민재", "서윤아"];
const REAL_AGENCIES = ["아티스트컴퍼니", "키이스트"];
const REAL_WORKS = ["시카고"];

beforeEach(() => {
  jest.clearAllMocks();
  useApp.mockReturnValue({ showToast: jest.fn(), userProfile: {}, deviceUserId: null });
  fetchArtistProfiles.mockRejectedValue(new Error("network"));
});

describe("B2BDashboardScreen — 데모 데이터 실명 제거", () => {
  it("실존 연예인 이름이 화면에 없다", async () => {
    const utils = render(<B2BDashboardScreen navigation={navigation} />);
    await waitFor(() => expect(fetchArtistProfiles).toHaveBeenCalled());
    REAL_NAMES.forEach((name) => {
      expect(utils.queryByText(new RegExp(name))).toBeNull();
    });
  });

  it("실존 소속사·작품명이 화면에 없다", async () => {
    const utils = render(<B2BDashboardScreen navigation={navigation} />);
    await waitFor(() => expect(fetchArtistProfiles).toHaveBeenCalled());
    [...REAL_AGENCIES, ...REAL_WORKS].forEach((word) => {
      expect(utils.queryByText(new RegExp(word))).toBeNull();
    });
  });
});

describe("B2BDashboardScreen — 통계 준비중 표시", () => {
  it("실데이터가 없는 통계(활성 프로젝트·캐스팅 제안·매칭률)는 '-' 대신 준비중 문구를 쓴다", async () => {
    const utils = render(<B2BDashboardScreen navigation={navigation} />);
    await waitFor(() => expect(fetchArtistProfiles).toHaveBeenCalled());
    expect(utils.queryAllByText("b2b.stat_preparing")).toHaveLength(3);
    expect(utils.queryByText("-")).toBeNull();
  });
});
