import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { AppState, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Audio } from 'expo-av';
import { checkSpeech } from '../services/speechCheckService';
import { newUuid } from '../services/practiceService';
import { getStorageScope } from '../utils/accountStorage';
const sec = n => `${Number(n).toFixed(1)}s`;
export default forwardRef(function SpeechCheckPanel({ accountId, takes = [], reference = '', scriptLanguage = 'ko', language = 'ko', busy, navigation, beforeListen, onAppendSummary }, ref) {
  const ko = language.startsWith('ko'), say = (a, b) => ko ? a : b;
  const [locale, setLocale] = useState(scriptLanguage === 'en' ? 'en-US' : 'ko-KR');
  const [text, setText] = useState(reference.length <= 400 ? reference : '');
  const [uri, setUri] = useState(takes.at(-1)?.uri || '');
  const [consent, setConsent] = useState(false), [running, setRunning] = useState(false);
  const [error, setError] = useState(''), [results, setResults] = useState([]);
  const [playing, setPlaying] = useState(false);
  const life = useRef(0), request = useRef(null), sound = useRef(null), playToken = useRef(0);
  const previousReference = useRef(reference);
  const current = useRef({ accountId, uri, text, locale, busy }); current.current = { accountId, uri, text, locale, busy };
  const stop = async () => { playToken.current++; const s = sound.current; sound.current = null; setPlaying(false); try { await s?.unloadAsync(); } catch {} };
  useImperativeHandle(ref, () => ({ stop }));
  const cancel = () => { life.current++; request.current?.abort(); request.current = null; setRunning(false); stop(); };
  useEffect(() => {
    const blur = navigation?.addListener?.('blur', cancel);
    const sub = AppState.addEventListener('change', state => { if (state !== 'active') cancel(); });
    return () => { life.current++; request.current?.abort(); playToken.current++; const s = sound.current; sound.current = null; s?.unloadAsync().catch(() => {}); blur?.(); sub?.remove?.(); };
  }, []);
  useEffect(() => { cancel(); setResults([]); setConsent(false); }, [accountId]);
  useEffect(() => { if (busy) cancel(); }, [busy]);
  const takeKey = takes.map(t => t.uri).join('|');
  useEffect(() => {
    cancel(); setUri(takes.at(-1)?.uri || ''); setConsent(false);
    setResults(old => old.filter(r => takes.some(t => t.uri === r.uri)));
  }, [takeKey]);
  useEffect(() => {
    if (previousReference.current === reference) return;
    previousReference.current = reference;
    cancel(); setText(reference.length <= 400 ? reference : ''); setUri(''); setConsent(false); setError('');
  }, [reference]);
  const change = action => { cancel(); setConsent(false); setError(''); action(); };
  const valid = results.filter(r => r.reference === text.trim() && r.locale === locale && takes.some(t => t.uri === r.uri));
  const selected = valid.find(r => r.uri === uri);
  const previous = valid.filter(r => r.uri !== uri).at(-1);
  const button = (id, label, action, disabled = false) => <TouchableOpacity key={id} testID={id} accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={action}
    style={{ minHeight: 44, padding: 12, borderRadius: 10, backgroundColor: disabled ? '#F0EDEE' : '#F8E4EA', marginTop: 6 }}><Text style={{ color: '#67243A' }}>{label}</Text></TouchableOpacity>;
  const run = async () => {
    if (busy || request.current || !consent || !uri || !text.trim() || !accountId) return;
    const id = ++life.current, scope = getStorageScope(), owner = accountId;
    const controller = new AbortController(); request.current = controller; setRunning(true); setError('');
    const timer = setTimeout(() => controller.abort(), 55000);
    try {
      const result = await checkSpeech({ accountId, uri, reference: text.trim(), locale, requestId: newUuid(), signal: controller.signal });
      if (id !== life.current || current.current.accountId !== owner || getStorageScope() !== scope || controller.signal.aborted) return;
      setResults(old => [...old.filter(r => !(r.uri === uri && r.reference === result.reference && r.locale === locale)), { ...result, uri }].slice(-10));
    } catch (e) {
      if (id === life.current && current.current.accountId === owner && getStorageScope() === scope) setError(e.name === 'AbortError' ? 'TIMEOUT' : e.message);
    } finally {
      clearTimeout(timer);
      if (request.current === controller) { request.current = null; setRunning(false); }
    }
  };
  const play = async (start = 0, end = selected?.signal.duration || 30, target = uri) => {
    if (busy || running) return;
    if (playing) { await stop(); return; }
    await stop(); const token = ++playToken.current;
    const owner = accountId, scope = getStorageScope();
    const stale = () => token !== playToken.current || current.current.busy || current.current.accountId !== owner || getStorageScope() !== scope;
    try {
      await beforeListen?.(); if (stale()) return;
      const { sound: s } = await Audio.Sound.createAsync({ uri: target }, { shouldPlay: false, positionMillis: Math.max(0, start * 1000), progressUpdateIntervalMillis: 50 });
      if (stale()) { await s.unloadAsync(); return; }
      sound.current = s; setPlaying(true);
      s.setOnPlaybackStatusUpdate(status => { if (sound.current === s && (status.didJustFinish || status.positionMillis >= end * 1000)) stop(); });
      await s.playAsync();
    } catch { if (!stale()) { await stop(); setError('PLAYBACK'); } }
  };
  const messages = {
    LOGIN_REQUIRED: say('로그인 후 녹음을 점검할 수 있어요.', 'Sign in to check a recording.'),
    DURATION_LIMIT: say('0.4~30초의 짧은 녹음을 선택해주세요.', 'Choose a recording between 0.4 and 30 seconds.'),
    INVALID_AUDIO: say('2MB 이하의 짧은 녹음을 선택해주세요. 녹음 파일을 읽지 못했어요.', 'Choose a short recording under 2 MB. The audio could not be read.'),
    SPEECH_LIMIT: say('최근 24시간 녹음 점검·말투 비교 체험 5회를 사용했어요.', 'You have used 5 recording checks/comparisons in the last 24 hours.'),
    SPEECH_BUSY: say('이미 처리 중인 요청이에요. 잠시 후 확인해주세요.', 'This request is already being processed.'),
    PLAYBACK: say('녹음을 재생하지 못했어요.', 'Could not play the recording.')
  };
  const summary = selected ? `${say('녹음 점검', 'Recording check')} · ${locale}\n${text.trim()}\n${say('길이', 'Duration')}: ${sec(selected.signal.duration)} / ${say('조용한 구간', 'Quiet intervals')}: ${selected.signal.quiet.length}\n${say('녹음 신호 기준이며 발음·사투리 교정 점수가 아닙니다.', 'Signal measurements, not a pronunciation or accent score.')}` : '';
  return <View testID="speech-check-panel" style={{ marginVertical: 16, padding: 18, borderRadius: 16, backgroundColor: '#FFF8FA', gap: 8 }}>
    <Text style={{ fontWeight: '700', fontSize: 19 }}>{say('녹음 구간 점검 · 체험', 'Check your recording · Preview')}</Text>
    <Text>{say('소리 크기와 조용한 구간을 확인하고, 같은 대사로 다시 녹음해 비교하세요.', 'Inspect sound levels and quiet intervals, then compare another take of the same line.')}</Text>
    <Text style={{ fontSize: 12 }}>{say('0.4~30초 · 2MB 이하 · 말투 비교와 합쳐 최근 24시간 5회. 기존 AI 글·영상 한도와 별도입니다.', '0.4–30 seconds · under 2 MB · 5 checks/comparisons per rolling 24 hours, separate from text/video AI allowances.')}</Text>
    <View style={{ flexDirection: 'row', gap: 8 }}>
      {button('speech-ko', `${locale === 'ko-KR' ? '✓ ' : ''}한국어`, () => change(() => setLocale('ko-KR')), busy || running)}
      {button('speech-en', `${locale === 'en-US' ? '✓ ' : ''}English (US)`, () => change(() => setLocale('en-US')), busy || running)}
    </View>
    <Text>{say('이 녹음에서 내가 말한 대사만 적어주세요. 상대역·음악이 섞이지 않은 녹음을 사용하세요.', 'Enter only the lines you spoke. Use a take without a partner voice or background music.')}</Text>
    <TextInput testID="speech-reference" accessibilityLabel={say('점검할 대사', 'Reference line')} multiline maxLength={400} value={text} editable={!busy && !running}
      onChangeText={v => change(() => setText(v))} placeholder={say('내가 녹음한 짧은 대사', 'The short line I recorded')}
      style={{ borderWidth: 1, borderColor: '#DBBCCA', borderRadius: 10, padding: 12, minHeight: 72 }} />
    {takes.map((t, i) => button(`speech-select-${i}`, `${uri === t.uri ? '✓ ' : ''}${say('녹음', 'Take')} ${i + 1}${t.name ? ` · ${t.name}` : ''}`, () => change(() => setUri(t.uri)), busy || running))}
    {!uri && <Text>{say('이 대사를 말한 녹음을 선택해주세요.', 'Select the take in which you spoke this line.')}</Text>}
    <TouchableOpacity testID="speech-consent" accessibilityRole="checkbox" accessibilityState={{ checked: consent, disabled: busy || running }} disabled={busy || running} onPress={() => setConsent(v => !v)} style={{ minHeight: 44, paddingVertical: 8 }}>
      <Text>{consent ? '☑ ' : '☐ '}{say('선택한 녹음·대사를 분석 서버에 보내는 데 동의합니다. 발음 평가가 연결되면 Microsoft에도 전송됩니다. 서버의 임시 녹음은 처리 후 삭제됩니다.', 'I agree to send this take and line to the analysis server, and to Microsoft when pronunciation assessment is enabled. Temporary server audio is deleted after processing.')}</Text>
    </TouchableOpacity>
    {!accountId && <Text>{messages.LOGIN_REQUIRED}</Text>}
    {button('speech-analyze', running ? say('녹음 확인 중…', 'Checking…') : say('선택한 녹음 점검', 'Check selected take'), run, busy || running || !consent || !accountId || !uri || !text.trim())}
    {!!error && <Text accessibilityRole="alert">{messages[error] || say('점검에 연결하지 못했어요. 녹음은 그대로 남아 있습니다. 다시 시도해주세요.', 'Could not complete the check. Your recording is unchanged. Please retry.')}</Text>}
    {selected && <View testID="speech-result" style={{ gap: 8 }}>
      <Text style={{ fontWeight: '700' }}>{say('이 녹음에서 확인한 것', 'Measured in this take')}</Text>
      <Text>{say('길이', 'Duration')} {sec(selected.signal.duration)} · {say('평균 신호 크기', 'Mean signal level')} {selected.signal.rmsDb} dBFS</Text>
      <Text>{say('기기·마이크 거리·주변 소리에 따라 달라져요. 호흡 상태나 실력 점수가 아닙니다.', 'Device, mic distance and background sound affect these measurements. They do not assess breathing or ability.')}</Text>
      {selected.signal.warnings.map(w => <Text key={w}>{w === 'CLIPPING' ? say('신호가 찌그러질 수 있어요. 마이크에서 조금 떨어져 다시 녹음하세요.', 'The signal may clip. Move slightly away from the mic and record again.') : say('입력 소리가 작거나 없어요. 마이크를 확인한 뒤 다시 녹음하세요.', 'The signal is low or absent. Check the microphone and record again.')}</Text>)}
      {selected.signal.quiet.length ? <Text>{say('조용한 구간은 연기 선택일 수도 있어요. 앞뒤를 듣고 유지할지 결정하세요.', 'Quiet intervals may be intentional. Listen around them and decide whether to keep them.')}</Text> : <Text>{say('0.3초 이상의 조용한 구간이 검출되지 않았어요. 배경 소음의 영향도 있을 수 있어요.', 'No quiet interval of at least 0.3 seconds was detected. Background noise may affect this.')}</Text>}
      {selected.signal.quiet.slice(0, 8).map((q, i) => button(`speech-quiet-${i}`, `${say('앞뒤 듣기', 'Listen around')} ${sec(q.start)}–${sec(q.end)}`, () => play(Math.max(0, q.start - 0.5), Math.min(selected.signal.duration, q.end + 0.5)), busy || running))}
      {selected.pronunciation.status === 'assessed' ? <View>
        <Text>{say('발음 모델이 표시한 확인 구간 · 참고용', 'Segments flagged by the pronunciation model · guidance only')}</Text>
        {selected.pronunciation.words.filter(w => w.issue || (w.accuracy !== null && w.accuracy < 70)).slice(0, 8).map((w, i) => button(`speech-word-${i}`, `${w.word} · ${sec(w.start)}`, () => play(Math.max(0, w.start - 0.2), Math.min(selected.signal.duration, w.end + 0.2)), busy || running))}
        <Text>{say('지역 말투나 연기 선택을 오답으로 확정하지 않습니다. 표시된 부분을 직접 들어보세요.', 'These flags do not establish that a regional accent or acting choice is wrong. Listen to the segment yourself.')}</Text>
      </View> : <Text>{selected.pronunciation.status === 'unavailable' ? say('자동 발음 평가는 아직 연결되지 않았어요. 지금 결과는 소리 크기와 구간 점검입니다.', 'Pronunciation assessment is not connected yet. This result covers signal levels and intervals.') : say('이 녹음의 발음을 신뢰할 만큼 평가하지 못했어요. 발음 점수는 표시하지 않습니다.', 'Pronunciation could not be assessed reliably for this take. No pronunciation score is shown.')}</Text>}
      {!!previous && <View testID="speech-comparison">
        <Text style={{ fontWeight: '700' }}>{say('같은 대사의 이전 점검과 비교', 'Compare a previous check of the same line')}</Text>
        <Text>{say('길이', 'Duration')} {sec(previous.signal.duration)} → {sec(selected.signal.duration)} · {say('조용한 구간 수', 'Quiet intervals')} {previous.signal.quiet.length} → {selected.signal.quiet.length}</Text>
        <Text>{say('차이를 보여주는 값입니다. 짧거나 적다고 더 좋은 연기는 아닙니다.', 'These show differences. Shorter or fewer is not necessarily better acting.')}</Text>
        {button('speech-play-previous', say('이전 녹음 듣기', 'Listen to previous take'), () => play(0, previous.signal.duration, previous.uri), busy || running)}
      </View>}
      {button('speech-play-current', playing ? say('재생 멈추기', 'Stop playback') : say('선택한 녹음 듣기', 'Listen to selected take'), () => play(), busy || running)}
      {onAppendSummary && button('speech-keep-summary', say('점검 요약을 노트 본문에 추가', 'Add check summary to note'), () => onAppendSummary(summary), busy || running)}
      <Text style={{ fontSize: 12 }}>{say('상세 결과는 이 화면에만 남습니다. 보관하려면 요약을 추가하고 노트를 저장하세요.', 'Detailed results stay on this screen. Add the summary and save your note to keep a record.')}</Text>
    </View>}
  </View>;
});
