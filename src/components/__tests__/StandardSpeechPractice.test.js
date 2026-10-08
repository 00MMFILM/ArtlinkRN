import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import StandardSpeechPractice from '../StandardSpeechPractice';
import * as Speech from 'expo-speech';
jest.mock('expo-speech', () => ({ speak: jest.fn(), stop: jest.fn(async () => {}), getAvailableVoicesAsync: jest.fn(async () => [{language:'ko-KR',identifier:'korean'}]) }));
const props = () => ({ content: '첫 번째 대사\n두 번째 대사', language: 'ko', onLineChange: jest.fn(), onRecord: jest.fn(), onStop: jest.fn(), onPlay: jest.fn(), beforeListen: jest.fn(async () => {}), navigation: { addListener: jest.fn(() => jest.fn()) } });
beforeEach(() => jest.clearAllMocks());
test('reference listens to only selected line without starting recording or analysis', async () => {
 const p = props(); const ui = render(<StandardSpeechPractice {...p} lineIndex={1} />);
 await waitFor(() => expect(ui.getByTestId('speech-listen').props.accessibilityState.disabled).toBe(false));
 fireEvent.press(ui.getByTestId('speech-listen'));
 await waitFor(() => expect(Speech.speak).toHaveBeenCalledWith('두 번째 대사', expect.objectContaining({language:'ko-KR'})));
 expect(p.onRecord).not.toHaveBeenCalled();
 expect(ui.getByText(/자동 발음/)).toBeTruthy();
 fireEvent.press(ui.getByTestId('speech-prev'));
 await waitFor(() => expect(p.onLineChange).toHaveBeenCalledWith(0));
});
test('recording blocks reference and playback while stop remains available', () => {
 const p = props(); const ui = render(<StandardSpeechPractice {...p} recording takes={[{uri:'file:///take'}]} />);
 fireEvent.press(ui.getByTestId('speech-listen')); fireEvent.press(ui.getByTestId('speech-take-0'));
 expect(Speech.speak).not.toHaveBeenCalled(); expect(p.onPlay).not.toHaveBeenCalled();
 fireEvent.press(ui.getByTestId('speech-record')); expect(p.onStop).toHaveBeenCalledTimes(1);
});
test('a delayed reference preparation cannot play after unmount', async () => {
 let finish; const p = props(); p.beforeListen = jest.fn(() => new Promise(r => { finish = r; }));
 const ui = render(<StandardSpeechPractice {...p} />); await waitFor(() => expect(ui.getByTestId('speech-listen').props.accessibilityState.disabled).toBe(false)); fireEvent.press(ui.getByTestId('speech-listen'));
 await waitFor(() => expect(p.beforeListen).toHaveBeenCalled()); ui.unmount();
 await act(async () => finish()); expect(Speech.speak).not.toHaveBeenCalled();
});
test('repeat recording keeps access to the previous take and does not erase content', () => {
 const p = props(); const ui = render(<StandardSpeechPractice {...p} takes={[{uri:'file:///a'}]} />);
 fireEvent.press(ui.getByTestId('speech-record')); expect(p.onRecord).toHaveBeenCalledTimes(1);
 fireEvent.press(ui.getByTestId('speech-take-0')); expect(p.onPlay).toHaveBeenCalledWith('file:///a',0);
 expect(ui.getByText('첫 번째 대사')).toBeTruthy();
});

test("missing Korean voice disables reference but keeps recording available", async () => {
 Speech.getAvailableVoicesAsync.mockResolvedValueOnce([{language:"en-US",identifier:"english"}]);
 const p=props(); const ui=render(<StandardSpeechPractice {...p}/>);
 await waitFor(() => expect(ui.getByText(/사용 가능한 한국어/)).toBeTruthy());
 fireEvent.press(ui.getByTestId("speech-listen")); expect(Speech.speak).not.toHaveBeenCalled();
 fireEvent.press(ui.getByTestId("speech-record")); expect(p.onRecord).toHaveBeenCalled();
});
