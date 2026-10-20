import React, { useState } from "react";
import { act, fireEvent, render } from "@testing-library/react-native";
import { Audio } from "expo-av";
import WorkReview, { MusicLoop } from "../WorkReview";
import { paragraphDiff, reviewRange, reviewNotes } from "../../utils/workReview";

jest.mock("expo-av", () => ({ Audio: { setAudioModeAsync: jest.fn(async () => {}), Sound: { createAsync: jest.fn() } } }));
const sound = () => ({
  unloadAsync: jest.fn(async () => {}), playAsync: jest.fn(async () => {}),
  setPositionAsync: jest.fn(async () => {}), setRateAsync: jest.fn(async () => {}),
  setOnPlaybackStatusUpdate: jest.fn(),
});
const props = { note: { id: 2, field: "music", voiceRecordings: [{ uri: "file:///own.wav" }] }, visible: true, ko: true, onAnchor: jest.fn(), beforePlay: jest.fn(async () => {}) };
beforeEach(() => jest.clearAllMocks());

test("range rejects blank, negative, reversed and out-of-file times", () => {
  expect(reviewRange("0", "2.5", 3)).toEqual({ start: 0, end: 2500 });
  for (const range of [["", 1, 3], [-1, 1, 3], [2, 2, 3], [0, 4, 3], [0, 2, NaN]]) expect(reviewRange(...range)).toBeNull();
});
test("Unicode revision reconstructs each original without modifying the notes", () => {
  const before = "봄\n꽃🌸\n끝", after = "봄\n달라진 꽃🌸\n끝";
  const rows = paragraphDiff(before, after);
  expect(rows.filter(r => r.kind !== "add").map(r => r.text).join("\n")).toBe(before);
  expect(rows.filter(r => r.kind !== "remove").map(r => r.text).join("\n")).toBe(after);
  expect(paragraphDiff("a\n".repeat(401), "b")).toBeNull();
  expect(reviewNotes([{ id: "1", body: " 메모 ", label: "0:02", uri: "file:///private", resolved: true }])).toEqual([{ id: "1", body: "메모", label: "0:02", resolved: true }]);
});
test("loops a phrase and stops when a range is edited", async () => {
  const player = sound();
  Audio.Sound.createAsync.mockResolvedValue({ sound: player, status: { durationMillis: 12000 } });
  const screen = render(<MusicLoop {...props} />);
  fireEvent.changeText(screen.getByTestId("review-start"), "2");
  fireEvent.changeText(screen.getByTestId("review-end"), "3");
  await act(async () => fireEvent.press(screen.getByTestId("review-play")));
  expect(player.setPositionAsync).toHaveBeenCalledWith(2000);
  const status = player.setOnPlaybackStatusUpdate.mock.calls[0][0];
  await act(async () => status({ isLoaded: true, positionMillis: 3100, isPlaying: true }));
  expect(player.setPositionAsync).toHaveBeenCalledTimes(2);
  fireEvent.press(screen.getByTestId("review-time-note"));
  expect(props.onAnchor).toHaveBeenCalledWith("현재 1 · 0:03");
  await act(async () => fireEvent.changeText(screen.getByTestId("review-end"), "1"));
  expect(player.unloadAsync).toHaveBeenCalledTimes(1);
});
test("a sound that finishes loading after leaving cannot play", async () => {
  let resolveLoad;
  const player = sound();
  Audio.Sound.createAsync.mockImplementation(() => new Promise(resolve => { resolveLoad = resolve; }));
  const screen = render(<MusicLoop {...props} />);
  await act(async () => { fireEvent.press(screen.getByTestId("review-play")); });
  screen.rerender(<MusicLoop {...props} visible={false} />);
  await act(async () => resolveLoad({ sound: player, status: { durationMillis: 12000 } }));
  expect(player.playAsync).not.toHaveBeenCalled();
  expect(player.unloadAsync).toHaveBeenCalledTimes(1);
});
test("another attachment taking playback ownership unloads the review sound", async () => {
  const player = sound();
  Audio.Sound.createAsync.mockResolvedValue({ sound: player, status: { durationMillis: 12000 } });
  const screen = render(<MusicLoop {...props} stopSignal={0} />);
  await act(async () => fireEvent.press(screen.getByTestId("review-play")));
  await act(async () => screen.rerender(<MusicLoop {...props} stopSignal={1} />));
  expect(player.unloadAsync).toHaveBeenCalledTimes(1);
});
test("failed saving preserves a paragraph note, successful retry clears only the draft", async () => {
  const save = jest.fn().mockRejectedValueOnce(new Error("DISK")).mockResolvedValueOnce();
  const note = { id: 2, field: "literature", content: "고친 문장", workReviewNotes: [] }, previousNote = { content: "원문" };
  function Harness() {
    const [draft, change] = useState({});
    return <WorkReview note={note} previousNote={previousNote} language="ko" draft={draft} onDraftChange={change} onSave={save} />;
  }
  const screen = render(<Harness />);
  fireEvent.press(screen.getByTestId("revision-line-0"));
  fireEvent.changeText(screen.getByTestId("review-note-input"), "감정을 장면으로 표현하기");
  await act(async () => fireEvent.press(screen.getByTestId("review-save")));
  expect(screen.getByTestId("review-note-input").props.value).toBe("감정을 장면으로 표현하기");
  await act(async () => fireEvent.press(screen.getByTestId("review-save")));
  expect(screen.getByTestId("review-note-input").props.value).toBe("");
  expect(note.content).toBe("고친 문장");
  expect(save.mock.calls[1][0][0]).toEqual(expect.objectContaining({ body: "감정을 장면으로 표현하기", label: expect.stringContaining("고친 문장") }));
});
