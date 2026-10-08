import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { AppState, Text, TouchableOpacity, View } from 'react-native';
import { speechLines } from '../utils/standardSpeech';
let Speech = null;
try { Speech = require('expo-speech'); } catch (_) {}

export default forwardRef(function StandardSpeechPractice({ content, language, lineIndex = 0, onLineChange, recording, busy, takes = [], onRecord, onStop, onPlay, beforeListen, navigation, owner }, ref) {
  const ko = String(language).startsWith('ko');
  const lines = speechLines(content);
  const selected = Math.min(lineIndex, Math.max(0, lines.length - 1));
  const [speaking, setSpeaking] = useState(false);
  const [voice, setVoice] = useState(null);
  const [voiceLoading, setVoiceLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(() => Speech?.getAvailableVoicesAsync?.()).then(voices => {
      if (!cancelled) setVoice(voices?.find(v => /^ko(?:[-_]|$)/i.test(v.language)) || null);
    }).catch(() => { if (!cancelled) setVoice(null); }).finally(() => { if (!cancelled) setVoiceLoading(false); });
    return () => { cancelled = true; };
  }, []);
  const [error, setError] = useState(false);
  const token = useRef(0), alive = useRef(true);
  const stop = async () => {
    token.current += 1;
    if (alive.current) setSpeaking(false);
    try { await Speech?.stop?.(); } catch (_) {}
  };
  useImperativeHandle(ref, () => ({ stop }));
  useEffect(() => {
    alive.current = true;
    const blur = navigation?.addListener?.('blur', stop);
    const sub = AppState.addEventListener('change', state => { if (state !== 'active') stop(); });
    return () => { alive.current = false; stop(); blur?.(); sub?.remove?.(); };
  }, [owner]); // Changing accounts must stop the reference voice.
  useEffect(() => { stop(); }, [content, selected, recording, busy]);
  const listen = async () => {
    if (recording || busy || !lines[selected] || !Speech?.speak || !voice) return;
    await stop();
    const current = ++token.current;
    try { await beforeListen?.(); } catch (_) { if (alive.current) setError(true); return; }
    if (!alive.current || token.current !== current) return;
    setError(false); setSpeaking(true);
    try {
      Speech.speak(lines[selected], { language: 'ko-KR', voice: voice.identifier, rate: 0.85,
        onDone: () => { if (alive.current && token.current === current) setSpeaking(false); },
        onError: () => { if (alive.current && token.current === current) { setSpeaking(false); setError(true); } },
      });
    } catch (_) { setSpeaking(false); setError(true); }
  };
  const button = (id, label, action, disabled = false) => <TouchableOpacity testID={id} accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={action} style={{ padding: 12, marginTop: 6, borderRadius: 10, backgroundColor: disabled ? '#eee' : '#FCE7EF', minHeight: 44 }}><Text style={{ color: '#67243A' }}>{label}</Text></TouchableOpacity>;
  return <View testID="standard-speech-practice" style={{ padding: 18, marginVertical: 12, backgroundColor: '#FFF8FA', borderRadius: 16, gap: 8 }}>
    <Text style={{ fontSize: 20, fontWeight: '700' }}>{ko ? '표준어 대사 연습' : 'Standard Korean dialogue practice'}</Text>
    <Text>{ko ? '원하는 말투를 연습하세요. 사투리를 잘못된 말로 평가하지 않습니다.' : 'Practice your chosen delivery. Regional dialects are not mistakes.'}</Text>
    <Text>{ko ? '1. 한 줄 듣기 → 2. 내 목소리 녹음 → 3. 듣고 다시 녹음' : '1. Listen → 2. Record yourself → 3. Listen and record again'}</Text>
    <Text>{ko ? '기기 음성 · 참고용. 공인된 표준 발음 예시나 억양 정답이 아닙니다. 자동 발음·사투리·억양 채점은 하지 않습니다.' : 'Device voice · reference only, not a certified pronunciation or intonation model. No automatic accent or pronunciation scoring.'}</Text>
    <Text style={{ fontSize: 18, lineHeight: 28, marginTop: 8 }}>{lines[selected] || (ko ? '아래 본문에 대사를 한 줄씩 적어주세요.' : 'Enter dialogue below, one line per paragraph.')}</Text>
    <Text>{lines.length ? `${selected + 1} / ${lines.length}` : ''}</Text>
    {button('speech-prev', ko ? '이전 줄' : 'Previous line', async () => { await stop(); onLineChange(selected - 1); }, selected === 0 || recording || busy)}
    {button('speech-next', ko ? '다음 줄' : 'Next line', async () => { await stop(); onLineChange(selected + 1); }, selected >= lines.length - 1 || recording || busy)}
    {button('speech-listen', speaking ? (ko ? '참고 음성 멈추기' : 'Stop reference') : (ko ? '이 줄 듣기 · 기기 음성' : 'Listen · device voice'), speaking ? stop : listen, recording || busy || !lines.length || !Speech?.speak || !voice)}
    {!voice && <Text>{voiceLoading ? (ko ? '한국어 기기 음성 확인 중…' : 'Checking Korean device voices…') : (ko ? '사용 가능한 한국어 기기 음성을 확인하지 못했어요. 녹음 연습은 계속할 수 있습니다.' : 'No available Korean device voice was confirmed. You can still record yourself.')}</Text>}
    {error && <Text>{ko ? '참고 음성을 재생하지 못했어요. 다시 눌러주세요.' : 'Could not play the reference. Try again.'}</Text>}
    {button('speech-record', recording ? (ko ? '녹음 마치기' : 'Finish recording') : takes.length ? (ko ? '다시 녹음 · 이전 녹음도 유지' : 'Record again · keep previous take') : (ko ? '내 목소리 녹음' : 'Record myself'), recording ? onStop : onRecord, busy || !lines.length)}
    {takes.map((take, index) => button(`speech-take-${index}`, ko ? `${index + 1}번째 녹음 듣기 / 멈추기` : `Play / stop take ${index + 1}`, () => onPlay(take.uri, index), recording || busy))}
    <Text>{ko ? '완료되면 화면 위 저장을 누르세요. 녹음은 이 기기에 남고, 노트의 글과 연습 모드는 계정 동기화 대상입니다. 듣기·녹음은 AI 이용량을 쓰지 않습니다.' : 'Tap Save above when finished. Recordings stay on this device; note text and practice mode can sync with your account. Listening and recording do not use AI credits.'}</Text>
  </View>;
});
