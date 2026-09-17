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
jest.mock("../../services/mauService", () => ({ trackFunnelEvent: jest.fn() }));
jest.mock("i18next", () => ({ language: "ko" }));

const { trackFunnelEvent } = require("../../services/mauService");

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

// 2인 대사 → 기록: 연습을 끝낸 자리에서 노트 작성으로 이어진다 (2단계까지는 길이 없었다)
describe("DuetPracticeScreen — 연습 기록 남기기", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn(() => Promise.reject(new Error("offline")));
  });

  const openScriptMode = (utils) => {
    fireEvent.press(utils.getAllByText(firstScene.play)[0]);
    fireEvent.press(utils.getByText("📜 대본 보기"));
  };

  it("큐 모드 마지막 줄에서 기록 버튼이 나오고, 장면 정보가 채워진 노트 작성으로 간다", () => {
    const utils = render(<DuetPracticeScreen navigation={navigation} />);
    openCueMode(utils);
    expect(utils.queryByText("연습 기록 남기기")).toBeNull(); // 첫 줄엔 없다

    for (let i = 0; i < firstScene.lines.length + 3; i++) {
      const next = utils.queryByText("다음") || utils.queryByText("건너뛰고 다음");
      if (!next) break;
      fireEvent.press(next);
    }

    fireEvent.press(utils.getByText("연습 기록 남기기"));
    expect(navigation.navigate).toHaveBeenCalledWith("NoteCreate", {
      prefill: {
        title: `${firstScene.play} 2인 대사`,
        field: "acting",
        seriesName: firstScene.play,
        sceneId: firstScene.id,
      },
    });
    expect(trackFunnelEvent).toHaveBeenCalledWith("duet_to_note", "ko");
    expect(completePractice).toHaveBeenCalledTimes(1); // 마지막 줄에서 이미 완료 — 중복 없음
  });

  it("대본 모드: '연습 끝'이 완료 신호를 채우고, 기록 버튼도 같은 인자로 간다", () => {
    const utils = render(<DuetPracticeScreen navigation={navigation} />);
    openScriptMode(utils);

    fireEvent.press(utils.getByText("연습 끝"));
    fireEvent.press(utils.getByText("연습 끝")); // 두 번 눌러도 완료는 1회
    expect(completePractice).toHaveBeenCalledTimes(1);
    expect(completePractice.mock.calls[0][0].sessionId).toBe("sess-duet");

    fireEvent.press(utils.getByText("연습 기록 남기기"));
    expect(navigation.navigate.mock.calls[0][1].prefill.sceneId).toBe(firstScene.id);
    expect(completePractice).toHaveBeenCalledTimes(1);
  });
});
