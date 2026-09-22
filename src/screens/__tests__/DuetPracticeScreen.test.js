import React from "react";
import { render, fireEvent, waitFor, act } from "@testing-library/react-native";
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
  useTranslation: () => ({ t: (k, o) => (o ? `${k}${JSON.stringify(o)}` : k) }),
}));
jest.mock("../../services/apiConfig", () => ({ SERVER_URL: "https://srv.test" }));
jest.mock("../../context/AppContext", () => ({ useApp: jest.fn() }));
jest.mock("expo-speech", () => ({ speak: jest.fn(), stop: jest.fn() }));
jest.mock("expo-av", () => ({
  Audio: {
    setAudioModeAsync: jest.fn(() => Promise.resolve()),
    requestPermissionsAsync: jest.fn(() => Promise.resolve({ granted: true })),
    RecordingOptionsPresets: { HIGH_QUALITY: { preset: "hq" } },
    Recording: { createAsync: jest.fn() },
    Sound: { createAsync: jest.fn(() => Promise.reject(new Error("no file"))) },
  },
}));

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

// ---- 성우 음성 파일 + 연습 녹음 (2026-09-22) ----
const { fnv1a, __resetVoiceManifest } = require("../../services/duetVoice");

const partnerRole = firstScene.lines[0].r; // 첫 줄의 주인 = 상대역
const myRoleIdx = 1 - partnerRole;
const nextPartnerIdx = firstScene.lines.findIndex((l, i) => i > 0 && l.r === partnerRole);
const fileUrl = (i) => `https://srv.test/duet-voice/${firstScene.id}/${String(i).padStart(2, "0")}.mp3`;
const goodManifest = () => {
  const m = {};
  firstScene.lines.forEach((l, i) => { m[String(i)] = fnv1a(l.t); });
  return { version: 1, scenes: { [firstScene.id]: m } };
};
const mockFetchWithManifest = (manifest) => {
  global.fetch = jest.fn((url) =>
    String(url).includes("/duet-voice/manifest.json")
      ? Promise.resolve({ ok: true, json: async () => manifest })
      : Promise.reject(new Error("offline"))
  );
};
const makeSound = () => ({
  setRateAsync: jest.fn(() => Promise.resolve()),
  playAsync: jest.fn(() => Promise.resolve()),
  stopAsync: jest.fn(() => Promise.resolve()),
  unloadAsync: jest.fn(() => Promise.resolve()),
  setOnPlaybackStatusUpdate: jest.fn(),
});
// 첫 줄이 상대 대사가 되도록 배역을 고르고 큐 연습으로
const openCueAsMe = (utils) => {
  fireEvent.press(utils.getAllByText(firstScene.play)[0]);
  if (myRoleIdx !== 0) fireEvent.press(utils.getByText(new RegExp("^" + firstScene.roles[myRoleIdx].name)));
  fireEvent.press(utils.getByText("🎬 큐 연습"));
};
const renderReady = async () => {
  const utils = render(<DuetPracticeScreen navigation={navigation} />);
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); // manifest 도착
  return utils;
};

describe("DuetPracticeScreen — 성우 음성 파일", () => {
  const Speech = require("expo-speech");
  const { Audio } = require("expo-av");
  let sounds;
  let showToast;
  beforeEach(() => {
    jest.clearAllMocks();
    __resetVoiceManifest();
    showToast = jest.fn();
    useApp.mockReturnValue({ showToast });
    sounds = [];
    Audio.Sound.createAsync.mockImplementation((src) => {
      const s = makeSound();
      s.uri = src.uri;
      sounds.push(s);
      return Promise.resolve({ sound: s });
    });
  });
  const soundFor = (i) => sounds.find((s) => s.uri === fileUrl(i));

  it("해시가 맞으면 파일을 Sound로 재생하고 속도는 피치 보정으로 적용한다 (TTS 안 씀)", async () => {
    mockFetchWithManifest(goodManifest());
    const utils = await renderReady();
    openCueAsMe(utils);
    fireEvent.press(utils.getByText("🔊 상대 대사 음성"));

    await waitFor(() => expect(soundFor(0)?.playAsync).toHaveBeenCalled());
    expect(soundFor(0).setRateAsync).toHaveBeenCalledWith(1, true);
    expect(Speech.speak).not.toHaveBeenCalled();

    fireEvent.press(utils.getByText("1.2x")); // 재생 중인 소리에도 바로 적용
    expect(soundFor(0).setRateAsync).toHaveBeenLastCalledWith(1.2, true);
  });

  it("다음 상대 대사를 미리 1개 로드해 두고, 그 줄로 가면 선로드한 소리를 그대로 쓴다", async () => {
    mockFetchWithManifest(goodManifest());
    const utils = await renderReady();
    openCueAsMe(utils);
    fireEvent.press(utils.getByText("🔊 상대 대사 음성"));
    fireEvent.press(utils.getByText("0.8x"));
    await waitFor(() => expect(soundFor(nextPartnerIdx)).toBeTruthy()); // 선로드
    const loadsBefore = Audio.Sound.createAsync.mock.calls.filter((c) => c[0].uri === fileUrl(nextPartnerIdx)).length;
    expect(loadsBefore).toBe(1);

    for (let i = 0; i < nextPartnerIdx; i++) fireEvent.press(utils.queryByText("다음") || utils.getByText("건너뛰고 다음"));
    await waitFor(() => expect(soundFor(nextPartnerIdx).playAsync).toHaveBeenCalled());
    expect(soundFor(nextPartnerIdx).setRateAsync).toHaveBeenCalledWith(0.8, true);
    expect(Audio.Sound.createAsync.mock.calls.filter((c) => c[0].uri === fileUrl(nextPartnerIdx)).length).toBe(1);
  });

  it("해시가 다르면(원격 대사 변경) 파일을 쓰지 않고 TTS로 읽는다", async () => {
    const m = goodManifest();
    m.scenes[firstScene.id]["0"] = "deadbeef";
    mockFetchWithManifest(m);
    const utils = await renderReady();
    openCueAsMe(utils);
    fireEvent.press(utils.getByText("🔊 상대 대사 음성"));
    expect(Speech.speak).toHaveBeenCalledTimes(1);
    expect(Audio.Sound.createAsync.mock.calls.some((c) => c[0].uri === fileUrl(0))).toBe(false);
  });

  it("manifest를 못 받으면 TTS로 읽는다", async () => {
    global.fetch = jest.fn(() => Promise.reject(new Error("offline")));
    const utils = await renderReady();
    openCueAsMe(utils);
    fireEvent.press(utils.getByText("🔊 상대 대사 음성"));
    expect(Speech.speak).toHaveBeenCalledTimes(1);
    expect(Audio.Sound.createAsync).not.toHaveBeenCalled();
  });

  it("Sound 로드가 실패하면 조용히 TTS로 대체한다 (오류 안내 없음)", async () => {
    mockFetchWithManifest(goodManifest());
    Audio.Sound.createAsync.mockImplementation(() => Promise.reject(new Error("404")));
    const utils = await renderReady();
    openCueAsMe(utils);
    fireEvent.press(utils.getByText("🔊 상대 대사 음성"));
    await waitFor(() => expect(Speech.speak).toHaveBeenCalledTimes(1));
    expect(showToast).not.toHaveBeenCalled();
  });

  it("재생(playAsync)이 실패해도 TTS로 대체하고 그 소리는 내린다", async () => {
    mockFetchWithManifest(goodManifest());
    Audio.Sound.createAsync.mockImplementation((src) => {
      const s = makeSound();
      s.uri = src.uri;
      s.playAsync.mockRejectedValue(new Error("play"));
      sounds.push(s);
      return Promise.resolve({ sound: s });
    });
    const utils = await renderReady();
    openCueAsMe(utils);
    fireEvent.press(utils.getByText("🔊 상대 대사 음성"));
    await waitFor(() => expect(Speech.speak).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(soundFor(0).unloadAsync).toHaveBeenCalled());
    expect(showToast).not.toHaveBeenCalled();
  });

  it("다음 줄로 넘어가면 재생 중인 소리를 멈추고 내린다", async () => {
    mockFetchWithManifest(goodManifest());
    const utils = await renderReady();
    openCueAsMe(utils);
    fireEvent.press(utils.getByText("🔊 상대 대사 음성"));
    await waitFor(() => expect(soundFor(0)?.playAsync).toHaveBeenCalled());

    fireEvent.press(utils.getByText("다음"));
    await waitFor(() => expect(soundFor(0).unloadAsync).toHaveBeenCalled());
    expect(soundFor(0).stopAsync).toHaveBeenCalled();
  });

  it("음성을 끄면 재생 중인 소리와 선로드한 소리를 모두 내린다", async () => {
    mockFetchWithManifest(goodManifest());
    const utils = await renderReady();
    openCueAsMe(utils);
    fireEvent.press(utils.getByText("🔊 상대 대사 음성"));
    await waitFor(() => expect(soundFor(0)?.playAsync).toHaveBeenCalled());
    await waitFor(() => expect(soundFor(nextPartnerIdx)).toBeTruthy());

    fireEvent.press(utils.getByText("🔊 상대 대사 음성"));
    await waitFor(() => expect(soundFor(0).unloadAsync).toHaveBeenCalled());
    await waitFor(() => expect(soundFor(nextPartnerIdx).unloadAsync).toHaveBeenCalled());
  });

  it("화면을 나가면(언마운트) 재생 중·선로드 소리를 내린다", async () => {
    mockFetchWithManifest(goodManifest());
    const utils = await renderReady();
    openCueAsMe(utils);
    fireEvent.press(utils.getByText("🔊 상대 대사 음성"));
    await waitFor(() => expect(soundFor(0)?.playAsync).toHaveBeenCalled());
    await waitFor(() => expect(soundFor(nextPartnerIdx)).toBeTruthy());

    utils.unmount();
    await waitFor(() => expect(soundFor(0).unloadAsync).toHaveBeenCalled());
    await waitFor(() => expect(soundFor(nextPartnerIdx).unloadAsync).toHaveBeenCalled());
  });

  it("로드 중에 다음 줄로 넘어가면 늦게 도착한 소리는 재생하지 않고 내린다", async () => {
    mockFetchWithManifest(goodManifest());
    let resolveLoad;
    Audio.Sound.createAsync.mockImplementation((src) => new Promise((res) => {
      const s = makeSound();
      s.uri = src.uri;
      sounds.push(s);
      if (src.uri === fileUrl(0)) resolveLoad = () => res({ sound: s });
      else res({ sound: s });
    }));
    const utils = await renderReady();
    openCueAsMe(utils);
    fireEvent.press(utils.getByText("🔊 상대 대사 음성"));
    fireEvent.press(utils.getByText("다음"));
    await act(async () => { resolveLoad(); await new Promise((r) => setTimeout(r, 0)); });
    expect(soundFor(0).playAsync).not.toHaveBeenCalled();
    await waitFor(() => expect(soundFor(0).unloadAsync).toHaveBeenCalled());
  });

  // 버그: createAsync에 타임아웃이 없어 느린 네트워크(선로드 안 된 줄 — 음성 켠 순간·첫 줄·처음부터)에서
  // 응답이 올 때까지 수 초~수십 초 무음이었다. 3초 넘기면 TTS로 대체하고, 늦게 온 Sound는 내린다.
  it("파일 로드가 3초를 넘기면 타임아웃하고 TTS로 대체하며, 늦게 도착한 소리는 내린다", async () => {
    mockFetchWithManifest(goodManifest());
    let resolveLoad;
    Audio.Sound.createAsync.mockImplementation((src) => new Promise((res) => {
      const s = makeSound();
      s.uri = src.uri;
      sounds.push(s);
      if (src.uri === fileUrl(0)) resolveLoad = () => res({ sound: s });
      else res({ sound: s }); // 선로드 등 다른 줄은 바로 응답 — 지금 재생 줄만 늦춘다
    }));
    const utils = await renderReady();
    openCueAsMe(utils);

    jest.useFakeTimers();
    try {
      fireEvent.press(utils.getByText("🔊 상대 대사 음성"));
      await act(async () => { await jest.advanceTimersByTimeAsync(3000); }); // 3초 타임아웃
      expect(Speech.speak).toHaveBeenCalledTimes(1);
      expect(soundFor(0).unloadAsync).not.toHaveBeenCalled(); // 아직 응답 전

      resolveLoad(); // 타임아웃 이후에 뒤늦게 도착
      await act(async () => {
        for (let i = 0; i < 6; i++) await jest.advanceTimersByTimeAsync(0); // releaseSound 마이크로태스크 체인 플러시
      });
      expect(soundFor(0).playAsync).not.toHaveBeenCalled();
      expect(soundFor(0).unloadAsync).toHaveBeenCalled(); // 누수 없이 내린다
    } finally {
      jest.useRealTimers();
    }
  });
});

describe("DuetPracticeScreen — 연습하면서 녹음", () => {
  const { Audio } = require("expo-av");
  let rec;
  let showToast;
  beforeEach(() => {
    jest.clearAllMocks();
    __resetVoiceManifest();
    global.fetch = jest.fn(() => Promise.reject(new Error("offline")));
    showToast = jest.fn();
    useApp.mockReturnValue({ showToast });
    rec = {
      stopAndUnloadAsync: jest.fn(() => Promise.resolve({ durationMillis: 12400 })),
      getURI: jest.fn(() => "file:///rec1.m4a"),
    };
    Audio.requestPermissionsAsync.mockImplementation(() => Promise.resolve({ granted: true }));
    Audio.Recording.createAsync.mockImplementation(() => Promise.resolve({ recording: rec }));
  });
  const openScript = (utils) => {
    fireEvent.press(utils.getAllByText(firstScene.play)[0]);
    fireEvent.press(utils.getByText("📜 대본 보기"));
  };
  const startRec = async (utils) => {
    fireEvent.press(utils.getByText("🎙 duet.record_start"));
    await waitFor(() => expect(utils.getByText(/duet\.record_stop/)).toBeTruthy());
  };

  it("큐 모드: 녹음 시작 → 권한·오디오 모드·HIGH_QUALITY 녹음, 경과 시간 표시 → 중지하면 unload 후 녹음 모드 해제", async () => {
    const utils = render(<DuetPracticeScreen navigation={navigation} />);
    openCueMode(utils);
    await startRec(utils);
    expect(Audio.requestPermissionsAsync).toHaveBeenCalled();
    expect(Audio.setAudioModeAsync).toHaveBeenCalledWith({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
    expect(Audio.Recording.createAsync).toHaveBeenCalledWith(Audio.RecordingOptionsPresets.HIGH_QUALITY);
    expect(utils.getByText("⏹ duet.record_stop 00:00")).toBeTruthy();

    fireEvent.press(utils.getByText(/duet\.record_stop/));
    await waitFor(() => expect(utils.getByText("🎙 duet.record_start")).toBeTruthy());
    expect(rec.stopAndUnloadAsync).toHaveBeenCalledTimes(1);
    expect(Audio.setAudioModeAsync).toHaveBeenLastCalledWith({ allowsRecordingIOS: false, playsInSilentModeIOS: true });
  });

  it("마이크 권한을 거부하면 안내만 띄우고 녹음하지 않는다", async () => {
    Audio.requestPermissionsAsync.mockImplementation(() => Promise.resolve({ granted: false }));
    const utils = render(<DuetPracticeScreen navigation={navigation} />);
    openCueMode(utils);
    fireEvent.press(utils.getByText("🎙 duet.record_start"));
    await waitFor(() => expect(showToast).toHaveBeenCalledWith("duet.record_permission", "error"));
    expect(Audio.Recording.createAsync).not.toHaveBeenCalled();
    expect(utils.getByText("🎙 duet.record_start")).toBeTruthy();
  });

  it("녹음 중 음성을 켜도 녹음 허용 모드를 유지한다", async () => {
    const utils = render(<DuetPracticeScreen navigation={navigation} />);
    openCueMode(utils);
    await startRec(utils);
    fireEvent.press(utils.getByText("🔊 상대 대사 음성"));
    expect(Audio.setAudioModeAsync).toHaveBeenLastCalledWith({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
  });

  it("대본 모드: 녹음 중 '연습 기록 남기기' → 먼저 멈추고 prefill에 voiceRecordings와 안내 문구", async () => {
    const utils = render(<DuetPracticeScreen navigation={navigation} />);
    openScript(utils);
    await startRec(utils);

    fireEvent.press(utils.getByText("연습 기록 남기기"));
    await waitFor(() => expect(navigation.navigate).toHaveBeenCalledTimes(1));
    expect(rec.stopAndUnloadAsync).toHaveBeenCalledTimes(1);
    const { prefill } = navigation.navigate.mock.calls[0][1];
    expect(prefill.voiceRecordings).toEqual([{ uri: "file:///rec1.m4a", duration: 12 }]);
    expect(prefill.content).toBe(
      `duet.record_note_hint${JSON.stringify({ play: firstScene.play, role: firstScene.roles[0].name })}`
    );
    expect(prefill.sessionId).toBe("sess-duet");
    expect(prefill.sceneId).toBe(firstScene.id);
    expect(completePractice).toHaveBeenCalledTimes(1);
  });

  it("큐 모드: 녹음을 토글로 멈춘 뒤 끝까지 가서 기록을 남기면 보관한 녹음이 넘어간다", async () => {
    const utils = render(<DuetPracticeScreen navigation={navigation} />);
    openCueMode(utils);
    await startRec(utils);
    fireEvent.press(utils.getByText(/duet\.record_stop/));
    await waitFor(() => expect(utils.getByText("🎙 duet.record_start")).toBeTruthy());

    for (let i = 0; i < firstScene.lines.length + 3; i++) {
      const next = utils.queryByText("다음") || utils.queryByText("건너뛰고 다음");
      if (!next) break;
      fireEvent.press(next);
    }
    fireEvent.press(utils.getByText("연습 기록 남기기"));
    expect(navigation.navigate).toHaveBeenCalledTimes(1);
    expect(navigation.navigate.mock.calls[0][1].prefill.voiceRecordings).toEqual([{ uri: "file:///rec1.m4a", duration: 12 }]);
  });

  it("녹음이 없으면 prefill은 기존 그대로 (voiceRecordings·content 없음)", () => {
    const utils = render(<DuetPracticeScreen navigation={navigation} />);
    openScript(utils);
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
    const { prefill } = navigation.navigate.mock.calls[0][1];
    expect("voiceRecordings" in prefill).toBe(false);
    expect("content" in prefill).toBe(false);
  });

  it("다른 씬으로 나가면 녹음을 멈추고 버린다 — 다음 씬 기록에 섞이지 않는다", async () => {
    const utils = render(<DuetPracticeScreen navigation={navigation} />);
    openScript(utils);
    await startRec(utils);
    fireEvent.press(utils.getByText("‹ 뒤로")); // 설정으로 (녹음 멈춤·보관)
    await waitFor(() => expect(rec.stopAndUnloadAsync).toHaveBeenCalledTimes(1));
    fireEvent.press(utils.getByText("‹ 뒤로")); // 씬 목록으로 (보관분 버림)

    openScript(utils);
    fireEvent.press(utils.getByText("연습 기록 남기기"));
    expect(navigation.navigate.mock.calls[0][1].prefill.voiceRecordings).toBeUndefined();
  });

  it("녹음 중 화면을 나가면(언마운트) 녹음을 멈춘다", async () => {
    const utils = render(<DuetPracticeScreen navigation={navigation} />);
    openCueMode(utils);
    await startRec(utils);
    utils.unmount();
    await waitFor(() => expect(rec.stopAndUnloadAsync).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(Audio.setAudioModeAsync).toHaveBeenLastCalledWith({ allowsRecordingIOS: false, playsInSilentModeIOS: true }));
  });

  it("멈춤이 실패해도 ref가 정리돼 다시 녹음할 수 있다", async () => {
    rec.stopAndUnloadAsync.mockImplementationOnce(() => Promise.reject(new Error("stop")));
    const utils = render(<DuetPracticeScreen navigation={navigation} />);
    openCueMode(utils);
    await startRec(utils);
    fireEvent.press(utils.getByText(/duet\.record_stop/));
    await waitFor(() => expect(utils.getByText("🎙 duet.record_start")).toBeTruthy());
    await startRec(utils);
    expect(Audio.Recording.createAsync).toHaveBeenCalledTimes(2);
  });

  // 버그: 노트 안내문이 "상대역 대사는 앱 음성으로 함께 녹음됐어요"를 항상 붙였다 —
  // 음성을 끈 채 녹음했으면 사실과 다르다. 녹음 중 한 번이라도 음성이 켜져 있었을 때만 붙는다.
  it("녹음 중 상대 음성을 한 번이라도 켰으면 노트 안내문에 음성 동봉 문구가 붙는다", async () => {
    const utils = render(<DuetPracticeScreen navigation={navigation} />);
    openCueMode(utils);
    await startRec(utils);
    fireEvent.press(utils.getByText("🔊 상대 대사 음성")); // 녹음 중 음성 켬

    for (let i = 0; i < firstScene.lines.length + 3; i++) {
      const next = utils.queryByText("다음") || utils.queryByText("건너뛰고 다음");
      if (!next) break;
      fireEvent.press(next);
    }
    fireEvent.press(utils.getByText("연습 기록 남기기"));
    await waitFor(() => expect(navigation.navigate).toHaveBeenCalledTimes(1));

    const { prefill } = navigation.navigate.mock.calls[0][1];
    expect(prefill.content).toBe(
      `duet.record_note_hint${JSON.stringify({ play: firstScene.play, role: firstScene.roles[0].name })} duet.record_note_hint_voice`
    );
  });

  it("녹음 중 상대 음성을 한 번도 켜지 않았으면 노트 안내문에 음성 문구가 붙지 않는다", async () => {
    const utils = render(<DuetPracticeScreen navigation={navigation} />);
    openCueMode(utils);
    await startRec(utils); // 음성은 계속 꺼진 채

    for (let i = 0; i < firstScene.lines.length + 3; i++) {
      const next = utils.queryByText("다음") || utils.queryByText("건너뛰고 다음");
      if (!next) break;
      fireEvent.press(next);
    }
    fireEvent.press(utils.getByText("연습 기록 남기기"));
    await waitFor(() => expect(navigation.navigate).toHaveBeenCalledTimes(1));

    const { prefill } = navigation.navigate.mock.calls[0][1];
    expect(prefill.content).toBe(
      `duet.record_note_hint${JSON.stringify({ play: firstScene.play, role: firstScene.roles[0].name })}`
    );
  });

  // 버그: 녹음 중지가 끝나기 전에 화면을 나가면, 언마운트 후에 stopRecording이 끝나면서
  // go()가 실행돼 이미 떠난 화면에서 NoteCreate로 이동했다.
  it("녹음 중지가 끝나기 전에 화면을 나가면 언마운트 후에는 노트 화면으로 이동하지 않는다", async () => {
    let resolveStop;
    rec.stopAndUnloadAsync.mockImplementation(() => new Promise((res) => {
      resolveStop = () => res({ durationMillis: 12400 });
    }));
    const utils = render(<DuetPracticeScreen navigation={navigation} />);
    openScript(utils);
    await startRec(utils);

    fireEvent.press(utils.getByText("연습 기록 남기기")); // stopRecording(true) 시작 — 아직 안 끝남
    utils.unmount(); // 결과가 오기 전에 화면을 나간다

    resolveStop();
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });

    expect(navigation.navigate).not.toHaveBeenCalled();
  });
});
