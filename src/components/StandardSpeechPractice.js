import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { AppState, Text, TouchableOpacity, View } from 'react-native';
import { speechLines } from '../utils/standardSpeech';
let Speech = null;
try { Speech = require('expo-speech'); } catch (_) {}

export default forwardRef(function StandardSpeechPractice({ content, language, lineIndex = 0, onLineChange, recording, inputDb = null, recordingSeconds = 0, busy, takes = [], onRecord, onStop, onPlay, beforeListen, navigation, owner }, ref) {
  const ko = String(language).startsWith('ko');
  const [showDetails, setShowDetails] = useState(false);
  const hasLevel = typeof inputDb === 'number' && Number.isFinite(inputDb);
  const level = hasLevel ? Math.round(Math.max(0, Math.min(1, (inputDb + 60) / 60)) * 100) : null;
  const seconds = Math.max(0, Math.floor(recordingSeconds || 0));
  const elapsed = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  const inputLabel = !hasLevel ? (ko ? '입력 소리 확인 중' : 'Checking input level')
    : inputDb < -55 ? (ko ? '입력 소리가 작아요' : 'Low input level')
    : inputDb > -3 ? (ko ? '입력 소리가 커요' : 'High input level')
    : (ko ? '소리가 들어오고 있어요' : 'Sound is coming in');
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
    <Text style={{ color: '#67243A' }}>{ko ? '한 줄 듣고, 내 목소리로 녹음하고, 다시 들어보세요.' : 'Listen to a line, record yourself, then listen back.'}</Text>
    <Text style={{ fontSize: 12, color: '#6D5B63' }}>{ko ? '기기 음성 · 참고용  /  듣기·녹음 무료' : 'Device voice · reference only  /  Free listening & recording'}</Text>
    <Text style={{ fontSize: 18, lineHeight: 28, marginTop: 8 }}>{lines[selected] || (ko ? '아래 본문에 대사를 한 줄씩 적어주세요.' : 'Enter dialogue below, one line per paragraph.')}</Text>
    <Text>{lines.length ? `${selected + 1} / ${lines.length}` : ''}</Text>
    {lines.length > 1 && <View style={{ flexDirection: 'row', gap: 8 }}>
      <View style={{ flex: 1 }}>{button('speech-prev', ko ? '이전 줄' : 'Previous line', async () => { await stop(); onLineChange(selected - 1); }, selected === 0 || recording || busy)}</View>
      <View style={{ flex: 1 }}>{button('speech-next', ko ? '다음 줄' : 'Next line', async () => { await stop(); onLineChange(selected + 1); }, selected >= lines.length - 1 || recording || busy)}</View>
    </View>}
    {button('speech-listen', speaking ? (ko ? '참고 음성 멈추기' : 'Stop reference') : (ko ? '이 줄 듣기 · 기기 음성' : 'Listen · device voice'), speaking ? stop : listen, recording || busy || !lines.length || !Speech?.speak || !voice)}
    {!voice && <Text>{voiceLoading ? (ko ? '한국어 기기 음성 확인 중…' : 'Checking Korean device voices…') : (ko ? '사용 가능한 한국어 기기 음성을 확인하지 못했어요. 녹음 연습은 계속할 수 있습니다.' : 'No available Korean device voice was confirmed. You can still record yourself.')}</Text>}
    {error && <Text>{ko ? '참고 음성을 재생하지 못했어요. 다시 눌러주세요.' : 'Could not play the reference. Try again.'}</Text>}
    {button('speech-record', recording ? (ko ? '녹음 마치기' : 'Finish recording') : takes.length ? (ko ? '다시 녹음 · 이전 녹음도 유지' : 'Record again · keep previous take') : (ko ? '내 목소리 녹음' : 'Record myself'), recording ? onStop : onRecord, busy || !lines.length)}
    {recording && <View testID="speech-input-monitor" style={{ paddingVertical: 8, gap: 8 }}>
      <Text style={{ fontWeight: '600', color: '#67243A' }}>{ko ? `녹음 중 · ${elapsed}` : `Recording · ${elapsed}`}</Text>
      <View testID="speech-input-level" accessibilityRole="progressbar" accessibilityLabel={ko ? '마이크 입력 크기' : 'Microphone input level'}
        accessibilityValue={hasLevel ? { min: 0, max: 100, now: level, text: inputLabel } : { text: inputLabel }}
        style={{ height: 8, borderRadius: 4, backgroundColor: '#E9DDE2', overflow: 'hidden' }}>
        <View style={{ width: `${level || 0}%`, height: 8, backgroundColor: '#AD4569' }} />
      </View>
      <Text style={{ color: '#67243A', fontSize: 13 }}>{inputLabel}</Text>
      <Text style={{ color: '#6D5B63', fontSize: 12 }}>{ko ? '소리 크기 표시입니다. 녹음 후 재생해서 확인하세요.' : 'Shows input level. Listen back after recording to check the sound.'}</Text>
    </View>}
    {takes.map((take, index) => button(`speech-take-${index}`, ko ? `${index + 1}번째 녹음 듣기 / 멈추기` : `Play / stop take ${index + 1}`, () => onPlay(take.uri, index), recording || busy))}
    <Text style={{ color: '#6D5B63', fontSize: 13 }}>{ko ? '녹음 후 화면 위 저장을 누르세요. 녹음은 이 기기에 보관돼요.' : 'Tap Save above when done. Recordings stay on this device.'}</Text>
    <TouchableOpacity testID="speech-details" accessibilityRole="button" accessibilityState={{ expanded: showDetails }}
      onPress={() => setShowDetails(value => !value)} style={{ minHeight: 44, justifyContent: 'center' }}>
      <Text style={{ color: '#67243A' }}>{showDetails ? (ko ? '연습 안내 접기' : 'Hide practice details') : (ko ? '연습·음성 안내 보기' : 'Practice & voice details')}</Text>
    </TouchableOpacity>
    {showDetails && <View style={{ gap: 8 }}>
      <Text>{ko ? '원하는 말투를 연습하세요. 사투리를 잘못된 말로 평가하지 않습니다.' : 'Practice your chosen delivery. Regional dialects are not mistakes.'}</Text>
      <Text>{ko ? '기기 음성은 참고용이며 공인된 표준 발음이나 억양 정답이 아닙니다. 자동 발음·사투리·억양 채점은 하지 않습니다.' : 'Device voice is for reference, not a certified pronunciation or intonation model. No automatic accent or pronunciation scoring.'}</Text>
      <Text>{ko ? '듣기·녹음은 AI 이용량을 쓰지 않습니다. AI 피드백과 녹음 점검에는 별도 이용 한도가 적용됩니다. 노트의 글과 연습 모드는 계정 동기화 대상입니다. 녹음은 이 기기에 저장되며, 녹음 점검에 동의하고 요청할 때 선택한 파일을 분석 서버로 전송합니다.' : 'Listening and recording do not use AI credits. AI feedback and recording checks have separate limits. Note text and practice mode can sync with your account. Recordings are saved on this device; a selected file is sent to the analysis server when you consent and request a recording check.'}</Text>
    </View>}
  </View>;
});
