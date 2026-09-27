import React from "react";
import { render, fireEvent, waitFor, act } from "@testing-library/react-native";
import RetakeCompareCard from "../RetakeCompareCard";
import { trackFunnelEvent } from "../../services/mauService";
import { getInfoAsync } from "expo-file-system/legacy";

jest.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key) => key }) }));
jest.mock("../../services/mauService", () => ({ trackFunnelEvent: jest.fn() }));
jest.mock("../../services/aiService", () => ({
  focusSummary: (text) => text.split("🔁")[0],
  changeSummary: (text) => text.includes("🔁") ? text.split("🔁")[1].trim() : "",
}));
jest.mock("expo-file-system/legacy", () => ({ getInfoAsync: jest.fn(async () => ({ exists: true })) }));
const mockPlayers = {};
jest.mock("expo-av", () => {
  const React = require("react");
  const { View } = require("react-native");
  return {
    ResizeMode: { CONTAIN: "contain" },
    Video: React.forwardRef((props, ref) => {
      const side = props.testID.replace("retake-video-", "");
      React.useImperativeHandle(ref, () => mockPlayers[side], [side]);
      return <View {...props} />;
    }),
  };
});
const previousNote = {
  id: "parent", chosenFocus: "호흡", aiScores: { growth: 1 },
  videoAnalysis: "🎯 0:04 호흡을 늦춰요.",
  images: [{ type: "video", uri: "file:///previous.mp4", duration: 30000 }],
};
const note = {
  id: "child", parentNoteId: "parent", focus: "호흡", aiScores: { growth: 5 },
  videoAnalysis: "🎯 0:12 시선\n🔁 0:03 첫 문장 호흡이 길어졌어요.",
  images: [{ type: "video", uri: "file:///current.mp4", duration: 30000 }],
};
const mount = (props = {}) => render(<RetakeCompareCard previousNote={previousNote} note={note} {...props} />);
const loadVideo = async (utils, side, durationMillis = 30000) => {
  await act(async () => fireEvent(utils.getByTestId(`retake-video-${side}`), "load", { isLoaded: true, durationMillis }));
};
beforeEach(() => {
  jest.clearAllMocks();
  getInfoAsync.mockResolvedValue({ exists: true });
  for (const side of ["previous", "current"]) {
    mockPlayers[side] = { pauseAsync: jest.fn(async () => {}), unloadAsync: jest.fn(async () => {}), playAsync: jest.fn(async () => {}), setPositionAsync: jest.fn(async () => {}) };
  }
});

test("compares the requested focus and actual change section, without score claims", async () => {
  const utils = mount({ onRetake: jest.fn() });
  await waitFor(() => expect(utils.getByTestId("retake-play-current").props.accessibilityState.disabled).toBe(false));
  expect(utils.getByText("호흡")).toBeTruthy();
  expect(utils.getByText("0:03 첫 문장 호흡이 길어졌어요.")).toBeTruthy();
  expect(utils.queryByText("focus.score_delta")).toBeNull();
  expect(trackFunnelEvent).toHaveBeenCalledWith("compare_viewed");
});

test("does not invent a change when old feedback has no change section", async () => {
  const utils = mount({ note: { ...note, videoAnalysis: "🎯 일반 피드백뿐입니다." } });
  await act(async () => {});
  expect(utils.getByText("retake.change_unavailable")).toBeTruthy();
  expect(utils.queryByText("🎯 일반 피드백뿐입니다.")).toBeNull();
});

test("a time chip seeks the corresponding take and switches without simultaneous players", async () => {
  const utils = mount();
  await waitFor(() => expect(utils.getByTestId("retake-seek-previous-4000")).toBeTruthy());
  await act(async () => fireEvent.press(utils.getByTestId("retake-seek-previous-4000")));
  await loadVideo(utils, "previous");
  expect(mockPlayers.previous.setPositionAsync).toHaveBeenCalledWith(4000);
  expect(mockPlayers.previous.playAsync).toHaveBeenCalledTimes(1);
  expect(utils.queryByTestId("retake-video-current")).toBeNull();
  await act(async () => fireEvent.press(utils.getByTestId("retake-seek-current-3000")));
  expect(mockPlayers.previous.pauseAsync).toHaveBeenCalled();
  expect(utils.queryByTestId("retake-video-previous")).toBeNull();
  await loadVideo(utils, "current");
  expect(mockPlayers.current.setPositionAsync).toHaveBeenCalledWith(3000);
  expect(mockPlayers.current.playAsync).toHaveBeenCalledTimes(1);
});

test("loading real duration removes timestamps beyond the video", async () => {
  const utils = mount();
  await waitFor(() => expect(utils.getByTestId("retake-seek-current-12000")).toBeTruthy());
  await act(async () => fireEvent.press(utils.getByTestId("retake-play-current")));
  await loadVideo(utils, "current", 5000);
  expect(utils.queryByTestId("retake-seek-current-12000")).toBeNull();
  expect(utils.getByTestId("retake-seek-current-3000")).toBeTruthy();
});

test("rapid take switches keep only the latest playback intent", async () => {
  const utils = mount();
  await waitFor(() => expect(utils.getByTestId("retake-seek-previous-4000")).toBeTruthy());
  await act(async () => fireEvent.press(utils.getByTestId("retake-play-previous")));
  await loadVideo(utils, "previous");
  let finishPause;
  mockPlayers.previous.pauseAsync.mockImplementationOnce(() => new Promise((resolve) => { finishPause = resolve; }));
  act(() => { fireEvent.press(utils.getByTestId("retake-play-current")); });
  await act(async () => fireEvent.press(utils.getByTestId("retake-seek-previous-4000")));
  await act(async () => finishPause());
  expect(utils.queryByTestId("retake-video-current")).toBeNull();
  expect(mockPlayers.previous.setPositionAsync).toHaveBeenCalledWith(4000);
});

test("screen blur stops the player; an unseen comparison does not count as a view", async () => {
  const utils = mount({ visible: false });
  await act(async () => {});
  expect(trackFunnelEvent).not.toHaveBeenCalled();
  utils.rerender(<RetakeCompareCard previousNote={previousNote} note={note} visible />);
  await act(async () => fireEvent.press(utils.getByTestId("retake-play-current")));
  await loadVideo(utils, "current");
  utils.rerender(<RetakeCompareCard previousNote={previousNote} note={note} visible={false} />);
  expect(mockPlayers.current.pauseAsync).toHaveBeenCalled();
  expect(mockPlayers.current.unloadAsync).toHaveBeenCalled();
  expect(utils.queryByTestId("retake-video-current")).toBeNull();
  expect(trackFunnelEvent).toHaveBeenCalledTimes(1);
});

test("unmount unloads the active take", async () => {
  const utils = mount();
  await waitFor(() => expect(utils.getByTestId("retake-seek-current-3000")).toBeTruthy());
  await act(async () => fireEvent.press(utils.getByTestId("retake-play-current")));
  await loadVideo(utils, "current");
  utils.unmount();
  expect(mockPlayers.current.pauseAsync).toHaveBeenCalled();
  expect(mockPlayers.current.unloadAsync).toHaveBeenCalled();
});

test("missing files and playback errors show a readable fallback", async () => {
  getInfoAsync.mockImplementation(async (uri) => ({ exists: !uri.includes("previous") }));
  const utils = mount();
  await waitFor(() => expect(utils.getByText("retake.video_unavailable")).toBeTruthy());
  expect(utils.queryByTestId("retake-play-previous")).toBeNull();
  await act(async () => fireEvent.press(utils.getByTestId("retake-play-current")));
  fireEvent(utils.getByTestId("retake-video-current"), "error", "not playable");
  expect(utils.getByText("retake.playback_failed")).toBeTruthy();
  expect(utils.queryByTestId("retake-play-current")).toBeNull();
});
