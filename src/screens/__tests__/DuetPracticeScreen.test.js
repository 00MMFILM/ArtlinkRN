import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";
import DuetPracticeScreen from "../DuetPracticeScreen";
import { startPractice, completePractice } from "../../services/practiceService";
import { useApp } from "../../context/AppContext";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import scenes from "../../data/duet-scenes.json";

jest.mock("../../services/practiceService", () => ({
  startPractice: jest.fn(() => ({ sessionId: "sess-duet", kind: "duet" })),
  completePractice: jest.fn(),
}));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: jest.fn(() => ({ top: 0, bottom: 0, left: 0, right: 0 })),
}));
jest.mock("../../services/mauService", () => ({ trackFunnelEvent: jest.fn() }));
jest.mock("i18next", () => ({ language: "ko" }));
jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k) => k }),
}));
jest.mock("../../context/AppContext", () => ({ useApp: jest.fn() }));
jest.mock("expo-speech", () => ({ speak: jest.fn(), stop: jest.fn() }));
jest.mock("expo-av", () => ({ Audio: { setAudioModeAsync: jest.fn(() => Promise.resolve()) } }));

const { trackFunnelEvent } = require("../../services/mauService");

const navigation = { goBack: jest.fn(), navigate: jest.fn() };
const firstScene = scenes.scenes[0];

const openCueMode = (utils) => {
  fireEvent.press(utils.getAllByText(firstScene.play)[0]);
  fireEvent.press(utils.getByText("🎬 큐 연습"));
};

describe("DuetPracticeScreen — 연습 세션", () => {
  let showToast;
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn(() => Promise.reject(new Error("offline")));
    showToast = jest.fn();
    useApp.mockReturnValue({ showToast });
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
  let showToast;
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn(() => Promise.reject(new Error("offline")));
    showToast = jest.fn();
    useApp.mockReturnValue({ showToast });
  });

  const openScriptMode = (utils) => {
    fireEvent.press(utils.getAllByText(firstScene.play)[0]);
    fireEvent.press(utils.getByText("📜 대본 보기"));
  };

  it("큐 모드 마지막 줄에서 기록 버튼이 나오고, 장면 정보 + sessionId가 채워진 노트 작성으로 간다", () => {
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
        sessionId: "sess-duet",
      },
    });
    expect(trackFunnelEvent).toHaveBeenCalledWith("duet_to_note", "ko");
    // 마지막 줄에서 이미 완료됐고, goToNote는 finishPractice를 또 부르지 않는다 — 세션은 하나
    expect(completePractice).toHaveBeenCalledTimes(1);
  });

  // 버그: goToNote가 finishPractice로 duet 세션을 끝낸 뒤 노트 화면이 별도 text 세션을 또 시작해 연습 1회가 2회로 집계됐다
  it("기록 버튼은 한 번만 완료 신호를 남기고, 다시 눌러도 중복 완료·중복 이동이 없다", () => {
    const utils = render(<DuetPracticeScreen navigation={navigation} />);
    openCueMode(utils);
    for (let i = 0; i < firstScene.lines.length + 3; i++) {
      const next = utils.queryByText("다음") || utils.queryByText("건너뛰고 다음");
      if (!next) break;
      fireEvent.press(next);
    }

    fireEvent.press(utils.getByText("연습 기록 남기기"));
    expect(navigation.navigate).toHaveBeenCalledTimes(1);
    expect(utils.getByText("duet.note_done")).toBeTruthy(); // 버튼 문구가 바뀐다

    fireEvent.press(utils.getByText("duet.note_done")); // 다시 눌러도(비활성) 아무 일도 없다
    expect(navigation.navigate).toHaveBeenCalledTimes(1);
    expect(completePractice).toHaveBeenCalledTimes(1);
  });

  it("대본 모드: '연습 끝'을 누르면 완료되고 토스트 + 뒤로가기로 반응이 보인다", () => {
    const utils = render(<DuetPracticeScreen navigation={navigation} />);
    openScriptMode(utils);

    fireEvent.press(utils.getByText("연습 끝"));
    expect(completePractice).toHaveBeenCalledTimes(1);
    expect(showToast).toHaveBeenCalledWith("duet.finished", "success");
    expect(navigation.goBack).toHaveBeenCalledTimes(1);

    fireEvent.press(utils.getByText("연습 끝")); // 두 번 눌러도 완료는 1회
    expect(completePractice).toHaveBeenCalledTimes(1);

    fireEvent.press(utils.getByText("연습 기록 남기기"));
    expect(navigation.navigate.mock.calls[0][1].prefill.sceneId).toBe(firstScene.id);
    expect(navigation.navigate.mock.calls[0][1].prefill.sessionId).toBe("sess-duet");
    expect(completePractice).toHaveBeenCalledTimes(1);
  });

  it("기록 버튼을 한 번 누르면 비활성화되고 문구가 duet.note_done으로 바뀐다 (대본 모드)", () => {
    const utils = render(<DuetPracticeScreen navigation={navigation} />);
    openScriptMode(utils);

    fireEvent.press(utils.getByText("연습 기록 남기기"));
    expect(utils.getByText("duet.note_done")).toBeTruthy();
    expect(navigation.navigate).toHaveBeenCalledTimes(1);

    fireEvent.press(utils.getByText("duet.note_done"));
    expect(navigation.navigate).toHaveBeenCalledTimes(1); // 재클릭은 무시된다
  });

  it("'처음부터'로 세션을 다시 시작하면 기록 버튼 상태도 초기화된다", () => {
    const utils = render(<DuetPracticeScreen navigation={navigation} />);
    openCueMode(utils);
    for (let i = 0; i < firstScene.lines.length + 3; i++) {
      const next = utils.queryByText("다음") || utils.queryByText("건너뛰고 다음");
      if (!next) break;
      fireEvent.press(next);
    }
    fireEvent.press(utils.getByText("연습 기록 남기기"));
    expect(utils.getByText("duet.note_done")).toBeTruthy();

    fireEvent.press(utils.getByText("처음부터"));
    expect(utils.queryByText("duet.note_done")).toBeNull(); // 새 세션 — 버튼 다시 살아있다
  });
});

// 버그: 하단 버튼 영역이 홈 인디케이터(insets.bottom)를 가려서 눌리던 문제
describe("DuetPracticeScreen — 하단 안전영역", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn(() => Promise.reject(new Error("offline")));
    useApp.mockReturnValue({ showToast: jest.fn() });
  });
  afterEach(() => {
    useSafeAreaInsets.mockReturnValue({ top: 0, bottom: 0, left: 0, right: 0 });
  });

  it("큐 모드 하단 여백에 insets.bottom이 반영된다", () => {
    useSafeAreaInsets.mockReturnValue({ top: 0, bottom: 34, left: 0, right: 0 });
    const utils = render(<DuetPracticeScreen navigation={navigation} />);
    openCueMode(utils);

    const stage = utils.getByTestId("duet-cue-stage");
    const flat = Object.assign({}, ...[].concat(stage.props.style));
    expect(flat.paddingBottom).toBe(20 + 34);
  });
});

// 원격 씬 데이터가 깨져 있으면(roles 범위를 벗어난 line.r 등) 번들 데이터를 그대로 쓴다
describe("DuetPracticeScreen — 원격 씬 데이터 방어", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useApp.mockReturnValue({ showToast: jest.fn() });
  });

  it("line.r이 roles 범위를 벗어난 원격 데이터는 무시하고 번들 데이터를 쓴다", async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({
        version: 2,
        scenes: [
          {
            id: "broken-scene",
            play: "깨진 원격 씬",
            author: "x",
            genre: "x",
            roles: [{ name: "A" }, { name: "B" }],
            lines: [{ r: 5, t: "범위 밖 배역" }], // roles.length는 2인데 r=5
          },
        ],
      }),
    }));

    const utils = render(<DuetPracticeScreen navigation={navigation} />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    // 살짝 기다려 fetch 체인이 다 풀리게 한다
    await new Promise((r) => setTimeout(r, 0));

    expect(utils.queryByText("깨진 원격 씬")).toBeNull();
    expect(utils.getAllByText(firstScene.play).length).toBeGreaterThan(0); // 번들 데이터 유지
  });

  it("roles·lines가 비어 있는 원격 데이터도 무시한다", async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({
        version: 2,
        scenes: [{ id: "empty-scene", play: "빈 씬", roles: [], lines: [] }],
      }),
    }));

    const utils = render(<DuetPracticeScreen navigation={navigation} />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 0));

    expect(utils.queryByText("빈 씬")).toBeNull();
    expect(utils.getAllByText(firstScene.play).length).toBeGreaterThan(0);
  });

  it("유효한 원격 데이터는 정상적으로 교체한다", async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({
        version: 2,
        scenes: [
          {
            id: "remote-scene",
            play: "유효한 원격 씬",
            author: "x",
            genre: "x",
            roles: [{ name: "A" }, { name: "B" }],
            lines: [{ r: 0, t: "안녕" }, { r: 1, t: "반가워" }],
          },
        ],
      }),
    }));

    const utils = render(<DuetPracticeScreen navigation={navigation} />);
    await waitFor(() => expect(utils.queryByText("유효한 원격 씬")).toBeTruthy());
  });
});

// 제보(2026-09-19): 큐 연습 첫 줄에서 "상대 대사 음성"을 켜도 아무 소리가 안 났다 —
// 음성이 "다음"으로 넘어갈 때만 재생돼, 지금 떠 있는 상대 대사와 첫 줄은 읽지 않았다.
describe("DuetPracticeScreen — 상대 대사 음성", () => {
  const Speech = require("expo-speech");
  const { Audio } = require("expo-av");
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn(() => Promise.reject(new Error("offline")));
    useApp.mockReturnValue({ showToast: jest.fn() });
  });

  // 첫 줄이 상대 대사가 되도록 내 배역을 고른다
  const partnerFirstRole = firstScene.lines[0].r === 0 ? 1 : 0;
  const openAsPartnerFirst = (utils) => {
    fireEvent.press(utils.getAllByText(firstScene.play)[0]);
    if (partnerFirstRole !== 0) fireEvent.press(utils.getByText(new RegExp("^" + firstScene.roles[partnerFirstRole].name)));
    fireEvent.press(utils.getByText("🎬 큐 연습"));
  };

  it("첫 줄에서 음성을 켜면 지금 떠 있는 상대 대사를 바로 읽는다", () => {
    const utils = render(<DuetPracticeScreen navigation={navigation} />);
    openAsPartnerFirst(utils);
    expect(Speech.speak).not.toHaveBeenCalled(); // 기본은 무음

    fireEvent.press(utils.getByText("🔊 상대 대사 음성"));

    expect(Speech.speak).toHaveBeenCalledTimes(1);
    expect(Speech.speak.mock.calls[0][1].language).toBe("ko-KR");
    expect(Audio.setAudioModeAsync).toHaveBeenCalledWith({ playsInSilentModeIOS: true }); // 아이폰 무음 스위치
  });

  it("음성을 켠 채 처음부터를 누르면 첫 상대 대사를 다시 읽는다", () => {
    const utils = render(<DuetPracticeScreen navigation={navigation} />);
    openAsPartnerFirst(utils);
    fireEvent.press(utils.getByText("🔊 상대 대사 음성"));
    Speech.speak.mockClear();

    fireEvent.press(utils.getByText("처음부터"));
    expect(Speech.speak).toHaveBeenCalledTimes(1);
  });

  it("음성을 끄면 재생을 멈춘다", () => {
    const utils = render(<DuetPracticeScreen navigation={navigation} />);
    openAsPartnerFirst(utils);
    fireEvent.press(utils.getByText("🔊 상대 대사 음성"));
    Speech.stop.mockClear();
    fireEvent.press(utils.getByText("🔊 상대 대사 음성"));
    expect(Speech.stop).toHaveBeenCalled();
  });
});
