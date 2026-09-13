import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import DuetPracticeScreen from "../DuetPracticeScreen";
import { startPractice, completePractice } from "../../services/practiceService";
import scenes from "../../data/duet-scenes.json";

jest.mock("../../services/practiceService", () => ({
  startPractice: jest.fn(() => ({ sessionId: "sess-duet", kind: "duet" })),
  completePractice: jest.fn(),
}));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const navigation = { goBack: jest.fn(), navigate: jest.fn() };
const firstScene = scenes.scenes[0];

const openCueMode = (utils) => {
  fireEvent.press(utils.getAllByText(firstScene.play)[0]);
  fireEvent.press(utils.getByText("🎬 큐 연습"));
};

describe("DuetPracticeScreen — 연습 세션", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn(() => Promise.reject(new Error("offline")));
  });

  it("모드를 고르면 장면 id로 세션이 시작된다 (대사 내용은 보내지 않는다)", () => {
    const utils = render(<DuetPracticeScreen navigation={navigation} />);
    openCueMode(utils);
    expect(startPractice).toHaveBeenCalledWith("duet", firstScene.id, "acting");
  });

  it("마지막 줄에 닿으면 완료가 딱 1회", () => {
    const utils = render(<DuetPracticeScreen navigation={navigation} />);
    openCueMode(utils);

    for (let i = 0; i < firstScene.lines.length + 3; i++) {
      const next = utils.queryByText("다음") || utils.queryByText("건너뛰고 다음");
      if (!next) break;
      fireEvent.press(next);
    }

    expect(utils.getByText("끝")).toBeTruthy();
    expect(completePractice).toHaveBeenCalledTimes(1);
    expect(completePractice.mock.calls[0][0].sessionId).toBe("sess-duet");
  });

  it("'처음부터'는 새 세션으로 다시 시작한다", () => {
    const utils = render(<DuetPracticeScreen navigation={navigation} />);
    openCueMode(utils);
    fireEvent.press(utils.getByText("처음부터"));
    expect(startPractice).toHaveBeenCalledTimes(2);
  });
});
