import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { AppState } from 'react-native';
import { Audio } from 'expo-av';
import KoreanDeliveryCoach from '../KoreanDeliveryCoach';
import { compareSpeech, getSpeechDrills } from '../../services/speechCompareService';
jest.mock('../../services/speechCompareService', () => ({ compareSpeech: jest.fn(), getSpeechDrills: jest.fn() }));
jest.mock('../../services/practiceService', () => ({ newUuid: () => '11111111-1111-4111-8111-111111111111' }));
jest.mock('../../utils/accountStorage', () => ({ getStorageScope: () => 'account:a' }));
jest.mock('expo-av', () => ({ Audio: { Sound: { createAsync: jest.fn() } } }));
const drill = { id: 'closing', text: '오늘은 여기까지 이야기할게요.', sha256: 'a'.repeat(64), uri: 'https://art-link.kr/speech-coach/v1/closing.mp3' };
const point = { start: 0.5, end: 1.4, change: -2, curve: Array(12).fill(0) };
const response = (delta = 5) => ({ version: 1, targetKind: 'ai-generated', targetHash: drill.sha256, reference: drill.text, status: 'compared',
  segments: [{ index: 1, word: '여기까지', target: point, attempt: { ...point, change: 3 }, pitchDelta: delta, durationRatio: 1 }],
  suggestions: [{ index: 1, focus: 'pitch', direction: 'less_rise' }], coverage: { compared: 1, total: 3 } });
const props = () => ({ accountId: 'a', takes: [{ uri: 'file:///a.m4a' }], language: 'ko', navigation: { addListener: jest.fn(() => jest.fn()) },
  beforeListen: jest.fn(async () => {}), onRecord: jest.fn(), onStop: jest.fn() });
const open = async ui => { fireEvent.press(ui.getByTestId('delivery-toggle')); await waitFor(() => expect(ui.queryByTestId('delivery-drill-closing')).toBeTruthy()); };
const run = async ui => { fireEvent.press(ui.getByTestId('delivery-consent')); fireEvent.press(ui.getByTestId('delivery-compare')); await waitFor(() => expect(ui.queryByTestId('delivery-result')).toBeTruthy()); };
beforeEach(() => { jest.clearAllMocks(); getSpeechDrills.mockResolvedValue({ available: true, drills: [drill] }); compareSpeech.mockResolvedValue(response()); });
afterEach(async () => { await act(async () => {}); });
test('no automatic upload, consent gates comparison, and every reference discloses synthetic origin', async () => {
  const ui = render(<KoreanDeliveryCoach {...props()} />); expect(getSpeechDrills).not.toHaveBeenCalled(); await open(ui);
  expect(ui.getByText(/기본 음성은 AI 합성/)).toBeTruthy();
  fireEvent.press(ui.getByTestId('delivery-compare')); expect(compareSpeech).not.toHaveBeenCalled(); await run(ui);
  expect(compareSpeech).toHaveBeenCalledWith(expect.objectContaining({ drill, uri: 'file:///a.m4a', reference: drill.text }));
  expect(ui.getByText(/자음·모음 오류는 판정하지/)).toBeTruthy();
});
test('record button uses existing recording controls before any take exists', async () => {
  const p = props(), ui = render(<KoreanDeliveryCoach {...p} takes={[]} />); await open(ui);
  fireEvent.press(ui.getByTestId('delivery-record')); expect(p.onRecord).toHaveBeenCalled();
  ui.rerender(<KoreanDeliveryCoach {...p} takes={[]} recording />); fireEvent.press(ui.getByTestId('delivery-record')); expect(p.onStop).toHaveBeenCalled();
});
test('new take keeps the old result and displays change against the same reference', async () => {
  const p = props(), ui = render(<KoreanDeliveryCoach {...p} />); await open(ui); await run(ui);
  ui.rerender(<KoreanDeliveryCoach {...p} takes={[...p.takes, { uri: 'file:///b.m4a' }]} />);
  expect(ui.queryByTestId('delivery-result')).toBeNull(); expect(ui.getByTestId('delivery-consent').props.accessibilityState.checked).toBe(false);
  compareSpeech.mockResolvedValue(response(2)); await run(ui); expect(ui.getByTestId('delivery-progress-1')).toBeTruthy();
  expect(ui.getByText(/5.0 → 2.0/)).toBeTruthy();
});
test('custom reference excludes itself from attempts and changing the text clears consent/results', async () => {
  const ui = render(<KoreanDeliveryCoach {...props()} takes={[{ uri: 'file:///a.m4a' }, { uri: 'file:///teacher.m4a' }]} />); await open(ui);
  fireEvent.press(ui.getByTestId('delivery-custom')); fireEvent.press(ui.getByTestId('delivery-target-1'));
  fireEvent.changeText(ui.getByTestId('delivery-reference-text'), drill.text); fireEvent.press(ui.getByTestId('delivery-take-0')); await run(ui);
  expect(compareSpeech).toHaveBeenCalledWith(expect.objectContaining({ targetUri: 'file:///teacher.m4a', drill: undefined, uri: 'file:///a.m4a' }));
  expect(ui.queryByTestId('delivery-take-1')).toBeNull(); fireEvent.changeText(ui.getByTestId('delivery-reference-text'), '다른 대사입니다.');
  expect(ui.queryByTestId('delivery-result')).toBeNull(); expect(ui.getByTestId('delivery-consent').props.accessibilityState.checked).toBe(false);
});
test('uncertain text produces no correction or word playback', async () => {
  compareSpeech.mockResolvedValue({ ...response(), status: 'text_uncertain', segments: [], suggestions: [] });
  const ui = render(<KoreanDeliveryCoach {...props()} />); await open(ui); await run(ui);
  expect(ui.getByText(/발음이 틀렸다는 뜻은 아닙니다/)).toBeTruthy(); expect(ui.queryByTestId('delivery-segment-1')).toBeNull();
});
test('account change cancels in-flight analysis and discards a late result', async () => {
  let resolve; compareSpeech.mockReturnValue(new Promise(r => { resolve = r; }));
  const p = props(), ui = render(<KoreanDeliveryCoach {...p} />); await open(ui);
  fireEvent.press(ui.getByTestId('delivery-consent')); fireEvent.press(ui.getByTestId('delivery-compare'));
  await waitFor(() => expect(compareSpeech).toHaveBeenCalled()); const { signal } = compareSpeech.mock.calls[0][0];
  ui.rerender(<KoreanDeliveryCoach {...p} accountId='b' />); expect(signal.aborted).toBe(true);
  await act(async () => resolve(response())); expect(ui.queryByTestId('delivery-result')).toBeNull();
});
test('double taps reserve synchronously while playback is being stopped', async () => {
  let unload; const s = { unloadAsync: jest.fn(() => new Promise(r => { unload = r; })), playAsync: jest.fn(async () => {}), setOnPlaybackStatusUpdate: jest.fn() };
  Audio.Sound.createAsync.mockResolvedValue({ sound: s });
  const ui = render(<KoreanDeliveryCoach {...props()} />); await open(ui); fireEvent.press(ui.getByTestId('delivery-listen-target'));
  await waitFor(() => expect(s.playAsync).toHaveBeenCalled()); fireEvent.press(ui.getByTestId('delivery-consent'));
  fireEvent.press(ui.getByTestId('delivery-compare')); fireEvent.press(ui.getByTestId('delivery-compare'));
  expect(compareSpeech).not.toHaveBeenCalled(); await act(async () => unload()); await waitFor(() => expect(compareSpeech).toHaveBeenCalledTimes(1));
});
test('closing during pending playback cleanup prevents the upload', async () => {
  let unload; const s = { unloadAsync: jest.fn(() => new Promise(r => { unload = r; })), playAsync: jest.fn(async () => {}), setOnPlaybackStatusUpdate: jest.fn() };
  Audio.Sound.createAsync.mockResolvedValue({ sound: s });
  const ui = render(<KoreanDeliveryCoach {...props()} />); await open(ui); fireEvent.press(ui.getByTestId('delivery-listen-target'));
  await waitFor(() => expect(s.playAsync).toHaveBeenCalled()); fireEvent.press(ui.getByTestId('delivery-consent')); fireEvent.press(ui.getByTestId('delivery-compare'));
  fireEvent.press(ui.getByTestId('delivery-toggle')); await act(async () => unload()); expect(compareSpeech).not.toHaveBeenCalled();
});
test('word replay seeks to real timestamps and unloads at the segment end', async () => {
  const s = { unloadAsync: jest.fn(async () => {}), playAsync: jest.fn(async () => {}), setOnPlaybackStatusUpdate: jest.fn() };
  Audio.Sound.createAsync.mockResolvedValue({ sound: s });
  const p = props(), ui = render(<KoreanDeliveryCoach {...p} />); await open(ui); await run(ui);
  fireEvent.press(ui.getByTestId('delivery-attempt-segment-1')); await waitFor(() => expect(s.playAsync).toHaveBeenCalled());
  expect(Audio.Sound.createAsync).toHaveBeenCalledWith({ uri: 'file:///a.m4a' }, expect.objectContaining({ positionMillis: 380 }));
  await act(async () => s.setOnPlaybackStatusUpdate.mock.calls[0][0]({ positionMillis: 1550 })); expect(s.unloadAsync).toHaveBeenCalled();
});
test('background cancels playback/requests and summary saves only on explicit action', async () => {
  let change; const spy = jest.spyOn(AppState, 'addEventListener').mockImplementation((_, fn) => { change = fn; return { remove: jest.fn() }; });
  const append = jest.fn(), ui = render(<KoreanDeliveryCoach {...props()} onAppendSummary={append} />); await open(ui); await run(ui);
  expect(append).not.toHaveBeenCalled(); fireEvent.press(ui.getByTestId('delivery-summary'));
  expect(append).toHaveBeenCalledWith(expect.stringContaining('AI 합성 기준 음성'));
  expect(append).toHaveBeenCalledWith(expect.stringContaining('사투리·발음의 정오 판정이 아닙니다'));
  act(() => change('background')); spy.mockRestore();
});
test('unauthenticated users can listen but cannot upload', async () => {
  const ui = render(<KoreanDeliveryCoach {...props()} accountId={null} />); await open(ui);
  fireEvent.press(ui.getByTestId('delivery-consent')); fireEvent.press(ui.getByTestId('delivery-compare')); expect(compareSpeech).not.toHaveBeenCalled();
});
test('unprepared server keeps listening/recording usable and disables paid analysis', async () => {
  getSpeechDrills.mockResolvedValue({ available: false, drills: [drill] });
  const p = props(), ui = render(<KoreanDeliveryCoach {...p} />); await open(ui);
  expect(ui.getByText(/비교 서비스가 아직 준비되지/)).toBeTruthy();
  fireEvent.press(ui.getByTestId('delivery-consent')); fireEvent.press(ui.getByTestId('delivery-compare')); expect(compareSpeech).not.toHaveBeenCalled();
  fireEvent.press(ui.getByTestId('delivery-record')); expect(p.onRecord).toHaveBeenCalled();
});
