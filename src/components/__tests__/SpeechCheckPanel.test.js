import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { Audio } from 'expo-av';
import SpeechCheckPanel from '../SpeechCheckPanel';
import { checkSpeech } from '../../services/speechCheckService';
jest.mock('../../services/speechCheckService', () => ({ checkSpeech: jest.fn() }));
jest.mock('../../services/practiceService', () => ({ newUuid: () => '11111111-1111-4111-8111-111111111111' }));
jest.mock('../../utils/accountStorage', () => ({ getStorageScope: () => 'account:a' }));
jest.mock('expo-av', () => ({ Audio: { Sound: { createAsync: jest.fn() } } }));
const nav = { addListener: jest.fn(() => jest.fn()) };
const props = () => ({accountId:'a',takes:[{uri:'file:///a.m4a'}],reference:'오늘은 여기까지.',language:'ko',navigation:nav,beforeListen:jest.fn(async()=>{})});
const result = (reference='오늘은 여기까지.',locale='ko-KR',duration=2) => ({version:1,locale,reference,signal:{duration,rmsDb:-20,quiet:[{start:.5,end:1}],warnings:[]},pronunciation:{status:'unavailable',words:[]}});
const analyze = async ui => {
 fireEvent.press(ui.getByTestId('speech-consent'));
 fireEvent.press(ui.getByTestId('speech-analyze'));
 await waitFor(()=>expect(ui.queryByTestId('speech-result')).toBeTruthy());
};
beforeEach(()=>{jest.clearAllMocks();checkSpeech.mockResolvedValue(result());});
afterEach(async()=>{await act(async()=>{});});
test('requires consent and account and preserves reference in the analysis request',async()=>{
 const p=props(),ui=render(<SpeechCheckPanel {...p}/>);
 fireEvent.press(ui.getByTestId('speech-analyze'));expect(checkSpeech).not.toHaveBeenCalled();
 await analyze(ui);expect(checkSpeech).toHaveBeenCalledWith(expect.objectContaining({accountId:'a',uri:'file:///a.m4a',reference:p.reference,locale:'ko-KR'}));
 expect(ui.getByText(/자동 발음 평가는 아직 연결/)).toBeTruthy();
});
test('guest cannot upload a recording',()=>{
 const ui=render(<SpeechCheckPanel {...props()} accountId={null}/>);
 fireEvent.press(ui.getByTestId('speech-consent'));fireEvent.press(ui.getByTestId('speech-analyze'));
 expect(checkSpeech).not.toHaveBeenCalled();expect(ui.getByText(/로그인 후/)).toBeTruthy();
});
test('changing reference clears consent and hides unrelated analysis',async()=>{
 const ui=render(<SpeechCheckPanel {...props()}/>);await analyze(ui);
 fireEvent.changeText(ui.getByTestId('speech-reference'),'다른 대사');
 expect(ui.queryByTestId('speech-result')).toBeNull();expect(ui.getByTestId('speech-consent').props.accessibilityState.checked).toBe(false);
});
test('changing the practice line requires choosing its recording again',async()=>{
 const p=props(),ui=render(<SpeechCheckPanel {...p}/>);await analyze(ui);
 ui.rerender(<SpeechCheckPanel {...p} reference='새로운 대사입니다.'/>);
 expect(ui.getByTestId('speech-reference').props.value).toBe('새로운 대사입니다.');
 expect(ui.queryByTestId('speech-result')).toBeNull();
 fireEvent.press(ui.getByTestId('speech-consent'));fireEvent.press(ui.getByTestId('speech-analyze'));
 expect(checkSpeech).toHaveBeenCalledTimes(1);
 expect(ui.getByText('이 대사를 말한 녹음을 선택해주세요.')).toBeTruthy();
});
test('compares two different takes only for the same reference and language',async()=>{
 const p=props(),ui=render(<SpeechCheckPanel {...p}/>);await analyze(ui);
 checkSpeech.mockResolvedValue(result(p.reference,'ko-KR',1.5));
 ui.rerender(<SpeechCheckPanel {...p} takes={[...p.takes,{uri:'file:///b.m4a'}]}/>);
 await analyze(ui);expect(ui.getByTestId('speech-comparison')).toBeTruthy();
 fireEvent.press(ui.getByTestId('speech-en'));expect(ui.queryByTestId('speech-comparison')).toBeNull();
});
test('rejected request keeps text and selected audio for an explicit retry',async()=>{
 checkSpeech.mockRejectedValueOnce(Error('SPEECH_LIMIT'));
 const p=props(),ui=render(<SpeechCheckPanel {...p}/>);
 fireEvent.press(ui.getByTestId('speech-consent'));fireEvent.press(ui.getByTestId('speech-analyze'));
 await waitFor(()=>expect(ui.queryByText(/체험 5회를 사용/)).toBeTruthy());
 expect(ui.getByTestId('speech-reference').props.value).toBe(p.reference);expect(ui.queryByTestId('speech-result')).toBeNull();
});
test('account change cancels an in-flight upload and discards its late response',async()=>{
 let resolve;checkSpeech.mockReturnValue(new Promise(r=>{resolve=r;}));
 const p=props(),ui=render(<SpeechCheckPanel {...p}/>);
 fireEvent.press(ui.getByTestId('speech-consent'));fireEvent.press(ui.getByTestId('speech-analyze'));
 const signal=checkSpeech.mock.calls[0][0].signal;
 ui.rerender(<SpeechCheckPanel {...p} accountId='b'/>);
 expect(signal.aborted).toBe(true);await act(async()=>resolve(result()));expect(ui.queryByTestId('speech-result')).toBeNull();
});
test('segment playback seeks before the quiet interval and stops at the end',async()=>{
 const s={unloadAsync:jest.fn(async()=>{}),playAsync:jest.fn(async()=>{}),setOnPlaybackStatusUpdate:jest.fn()};
 Audio.Sound.createAsync.mockResolvedValue({sound:s});
 const p=props(),ui=render(<SpeechCheckPanel {...p}/>);await analyze(ui);
 fireEvent.press(ui.getByTestId('speech-quiet-0'));
 await waitFor(()=>expect(s.playAsync).toHaveBeenCalled());
 expect(p.beforeListen).toHaveBeenCalled();expect(Audio.Sound.createAsync).toHaveBeenCalledWith({uri:'file:///a.m4a'},expect.objectContaining({positionMillis:0}));
 await act(async()=>s.setOnPlaybackStatusUpdate.mock.calls[0][0]({positionMillis:1500}));
 expect(s.unloadAsync).toHaveBeenCalled();
});
test('English dialogue selection is independent from Korean interface language',async()=>{
 checkSpeech.mockResolvedValue(result('Good morning.','en-US'));
 const ui=render(<SpeechCheckPanel {...props()} reference='Good morning.' scriptLanguage='en'/>);await analyze(ui);
 expect(checkSpeech).toHaveBeenCalledWith(expect.objectContaining({locale:'en-US',reference:'Good morning.'}));
});
test('failed playback unloads the sound and allows another attempt',async()=>{
 const s={unloadAsync:jest.fn(async()=>{}),playAsync:jest.fn(async()=>{throw Error('device');}),setOnPlaybackStatusUpdate:jest.fn()};
 Audio.Sound.createAsync.mockResolvedValue({sound:s});
 const ui=render(<SpeechCheckPanel {...props()}/>);await analyze(ui);
 fireEvent.press(ui.getByTestId('speech-play-current'));
 await waitFor(()=>expect(ui.queryByText('녹음을 재생하지 못했어요.')).toBeTruthy());
 expect(s.unloadAsync).toHaveBeenCalled();
 expect(ui.getByText('선택한 녹음 듣기')).toBeTruthy();
});
test('keeps a summary only after the explicit button action',async()=>{
 const append=jest.fn(),ui=render(<SpeechCheckPanel {...props()} onAppendSummary={append}/>);await analyze(ui);
 expect(append).not.toHaveBeenCalled();fireEvent.press(ui.getByTestId('speech-keep-summary'));
 expect(append).toHaveBeenCalledWith(expect.stringContaining('발음·사투리 교정 점수가 아닙니다'));
});
