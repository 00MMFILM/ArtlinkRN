import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { AppState, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Svg, { Line, Polyline } from 'react-native-svg';
import { Audio } from 'expo-av';
import { compareSpeech, getSpeechDrills } from '../services/speechCompareService';
import { newUuid } from '../services/practiceService';
import { getStorageScope } from '../utils/accountStorage';

const sec = n => `${Number(n).toFixed(1)}s`;
function PitchLines({ target, attempt, label }) {
  const paths = curve => {
    const segments = []; let points = [];
    curve.forEach((value, i) => {
      if (value === null) { if (points.length) segments.push(points.join(' ')); points = []; }
      else points.push(`${8 + i * 264 / 11},${56 - Math.max(-12, Math.min(12, value)) * 3.5}`);
    });
    if (points.length) segments.push(points.join(' ')); return segments;
  };
  return <View accessible accessibilityLabel={label} style={styles.graph}>
    <Svg width="100%" height={112} viewBox="0 0 280 112">
      <Line x1="8" y1="56" x2="272" y2="56" stroke="#D7DEDA" strokeDasharray="4 4" />
      {paths(target).map((points, i) => <Polyline key={`t${i}`} points={points} fill="none" stroke="#317465" strokeWidth="2.5" strokeDasharray="5 3" />)}
      {paths(attempt).map((points, i) => <Polyline key={`a${i}`} points={points} fill="none" stroke="#AA4565" strokeWidth="2.5" />)}
    </Svg>
  </View>;
}

export default forwardRef(function KoreanDeliveryCoach({ accountId, language = 'ko', takes = [], busy = false, recording = false,
  onRecord, onStop, beforeListen, onAppendSummary, navigation }, ref) {
  const ko = String(language).startsWith('ko'), say = (a, b) => ko ? a : b;
  const [open, setOpen] = useState(false), [drills, setDrills] = useState([]), [available, setAvailable] = useState(false);
  const [loading, setLoading] = useState(false), [source, setSource] = useState(''), [customText, setCustomText] = useState('');
  const [targetUri, setTargetUri] = useState(''), [uri, setUri] = useState(''), [consent, setConsent] = useState(false);
  const [running, setRunning] = useState(false), [error, setError] = useState(''), [results, setResults] = useState([]), [playing, setPlaying] = useState('');
  const generation = useRef(0), controller = useRef(null), catalogRequest = useRef(null), sound = useRef(null), playback = useRef(0);
  const owner = useRef(accountId); owner.current = accountId;
  const blocked = useRef(busy || recording); blocked.current = busy || recording;
  const drill = drills.find(d => d.id === source);
  const reference = source === 'custom' ? customText.trim() : drill?.text || '';
  const target = source === 'custom' ? targetUri : drill?.uri;
  const key = `${source}:${target || ''}:${drill?.sha256 || ''}:${reference}`;
  const valid = results.filter(r => r.key === key && takes.some(t => t.uri === r.uri));
  const selected = valid.find(r => r.uri === uri);
  const previous = selected && valid.filter(r => r.uri !== uri && r.targetHash === selected.targetHash && r.status === 'compared').at(-1);
  const stop = async () => { playback.current++; const s = sound.current; sound.current = null; setPlaying(''); try { await s?.unloadAsync(); } catch {} };
  const cancel = () => { generation.current++; controller.current?.abort(); controller.current = null; setRunning(false); stop(); };
  useImperativeHandle(ref, () => ({ stop }));
  useEffect(() => {
    const blur = navigation?.addListener?.('blur', cancel);
    const sub = AppState.addEventListener('change', state => { if (state !== 'active') cancel(); });
    return () => { generation.current++; controller.current?.abort(); catalogRequest.current?.abort(); playback.current++;
      sound.current?.unloadAsync().catch(() => {}); blur?.(); sub?.remove?.(); };
  }, []);
  useEffect(() => { cancel(); setResults([]); setConsent(false); setCustomText(''); setTargetUri(''); setError(''); }, [accountId]);
  useEffect(() => { if (busy || recording) cancel(); }, [busy, recording]);
  const takeKey = takes.map(t => t.uri).join('|');
  useEffect(() => {
    cancel(); setConsent(false); setUri(takes.filter(t => source !== 'custom' || t.uri !== targetUri).at(-1)?.uri || '');
    if (targetUri && !takes.some(t => t.uri === targetUri)) setTargetUri('');
    setResults(old => old.filter(r => takes.some(t => t.uri === r.uri)));
  }, [takeKey]);
  const change = action => { cancel(); setConsent(false); setError(''); action(); };
  const load = async () => {
    cancel(); setConsent(false);
    catalogRequest.current?.abort(); const request = new AbortController(); catalogRequest.current = request;
    setLoading(true); setError('');
    try {
      const data = await getSpeechDrills(request.signal);
      if (request.signal.aborted) return;
      setDrills(data.drills); setAvailable(data.available); setSource(old => old || data.drills[0]?.id || 'custom');
    } catch { if (!request.signal.aborted) setError('UNAVAILABLE'); }
    finally { if (catalogRequest.current === request) { catalogRequest.current = null; setLoading(false); } }
  };
  const toggle = () => { if (open) { cancel(); catalogRequest.current?.abort(); } else if (!drills.length) load(); setOpen(v => !v); };
  const play = async (audioUri, start = 0, end = 30) => {
    if (blocked.current || running || !audioUri) return;
    const id = `${audioUri}:${start}:${end}`;
    if (playing === id) { await stop(); return; }
    const stopped = stop(), token = playback.current, account = accountId, scope = getStorageScope();
    const stale = () => token !== playback.current || owner.current !== account || getStorageScope() !== scope || blocked.current;
    try {
      await stopped; if (stale()) return;
      await beforeListen?.(); if (stale()) return;
      const { sound: next } = await Audio.Sound.createAsync({ uri: audioUri }, { shouldPlay: false, positionMillis: Math.max(0, start * 1000), progressUpdateIntervalMillis: 50 });
      if (stale()) { await next.unloadAsync(); return; }
      sound.current = next; setPlaying(id);
      next.setOnPlaybackStatusUpdate(s => { if (sound.current === next && (s.didJustFinish || s.positionMillis >= end * 1000)) stop(); });
      await next.playAsync();
    } catch { if (!stale()) { await stop(); setError('PLAYBACK'); } }
  };
  const run = async () => {
    if (blocked.current || controller.current || !available || !consent || !accountId || !uri || !target || uri === target || !reference) return;
    const request = new AbortController(), id = ++generation.current, account = accountId, scope = getStorageScope();
    controller.current = request; setRunning(true); setError('');
    const timer = setTimeout(() => request.abort(), 55000);
    try {
      await stop();
      if (id !== generation.current || owner.current !== account || scope !== getStorageScope() || request.signal.aborted || blocked.current) return;
      const result = await compareSpeech({ accountId, uri, reference, targetUri: source === 'custom' ? targetUri : undefined,
        drill: source === 'custom' ? undefined : drill, requestId: newUuid(), signal: request.signal });
      if (id !== generation.current || owner.current !== account || scope !== getStorageScope() || request.signal.aborted) return;
      setResults(old => [...old.filter(r => !(r.key === key && r.uri === uri)), { ...result, key, uri }].slice(-10));
    } catch (e) {
      if (id === generation.current && owner.current === account && scope === getStorageScope()) setError(e.message || 'UNAVAILABLE');
    } finally { clearTimeout(timer); if (controller.current === request) { controller.current = null; setRunning(false); } }
  };
  const advice = direction => ({
    less_rise: say('이 말의 끝부분을 지금보다 조금 낮추며 기준의 흐름을 따라 읽어보세요.', 'Let the end of this word move a little lower, following the selected reference.'),
    more_rise: say('이 말의 끝부분을 지금보다 조금 올리며 기준의 흐름을 따라 읽어보세요.', 'Let the end of this word move a little higher, following the selected reference.'),
    shorter: say('문장 안에서 이 말을 조금 짧게 이어 읽고 기준과 다시 비교하세요.', 'Give this word a little less of the sentence time, then compare again.'),
    longer: say('문장 안에서 이 말을 조금 더 여유 있게 읽고 기준과 다시 비교하세요.', 'Give this word a little more of the sentence time, then compare again.')
  })[direction];
  const trend = value => Math.abs(value) < 1 ? say('큰 변화 없음', 'Nearly level') : value > 0 ? say('올라감', 'Rising') : say('내려감', 'Falling');
  const message = {
    SPEECH_BUSY: say('앞선 녹음 비교가 처리 중입니다. 잠시 후 다시 시도해주세요.', 'A previous recording is still processing. Please retry shortly.'),
    INVALID_INPUT: say('한글 대사와 서로 다른 짧은 녹음을 선택해주세요.', 'Use a Korean line and two different short recordings.'),
    LOGIN_REQUIRED: say('로그인 후 비교할 수 있어요.', 'Sign in to compare recordings.'),
    INVALID_AUDIO: say('각각 1.4MB 이하의 녹음을 선택해주세요.', 'Choose recordings under 1.4 MB each.'),
    DURATION_LIMIT: say('각각 0.4~30초의 짧은 녹음을 사용해주세요.', 'Use short recordings of 0.4–30 seconds each.'),
    RECORD_AGAIN: say('소리가 너무 작거나 찌그러져 있어요. 조용한 곳에서 다시 녹음해주세요.', 'The signal is low or clipped. Record again in a quiet place.'),
    SAME_RECORDING: say('기준과 내 녹음은 서로 다른 파일로 선택해주세요.', 'Select different files for the reference and your take.'),
    REFERENCE_CHANGED: say('기준 음성이 바뀌었어요. 연습 음성을 다시 불러와 주세요.', 'The reference has changed. Reload the practice voices.'),
    SPEECH_LIMIT: say('최근 24시간 녹음 점검·말투 비교 5회를 사용했어요.', 'You have used 5 recording checks/comparisons in the last 24 hours.'),
    PLAYBACK: say('음성을 재생하지 못했어요. 다시 눌러주세요.', 'Could not play the audio. Please retry.')
  };
  const btn = (id, label, onPress, disabled = false) => <TouchableOpacity key={id} testID={id} accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={[styles.button, disabled && styles.disabled]}><Text style={styles.buttonText}>{label}</Text></TouchableOpacity>;
  const locked = busy || recording || running;
  const keep = () => onAppendSummary?.(`${say('말투 따라하기 · 기준 음성과 비교', 'Delivery practice · comparison with selected reference')}\n${reference}\n${selected.targetKind === 'ai-generated' ? say('AI 합성 기준 음성', 'AI-generated reference') : say('직접 선택한 기준 음성', 'User-selected reference')}\n${selected.suggestions.map(s => {
    const segment = selected.segments.find(p => p.index === s.index); return `${segment.word} (${sec(segment.attempt.start)}–${sec(segment.attempt.end)}): ${advice(s.direction)}`;
  }).join('\n')}\n${say('선택한 기준을 따라 연습하기 위한 측정 기반 제안입니다. 사투리·발음의 정오 판정이 아닙니다.', 'Measurement-based practice suggestions for this reference, not a verdict on dialect or pronunciation.')}`);
  return <View style={styles.card} testID="korean-delivery-coach">
    <TouchableOpacity testID="delivery-toggle" accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={toggle} style={styles.headingButton}>
      <Text style={styles.heading}>{say('표준어 말투 따라하기 · 실험 기능', 'Korean delivery practice · Experimental')}</Text>
      <Text>{open ? '−' : '+'}</Text>
    </TouchableOpacity>
    <Text style={styles.caption}>{say('기준 음성과 같은 대사를 읽고, 높낮이·길이가 다른 구간을 연습하세요.', 'Read the same line as your reference and rehearse differences in pitch movement and timing.')}</Text>
    {open && <View style={styles.content}>
      <Text style={styles.step}>{say('1. 따라 읽을 기준 선택', '1. Choose a reference')}</Text>
      {drills.map(d => btn(`delivery-drill-${d.id}`, `${source === d.id ? '✓ ' : ''}${d.text}`, () => change(() => setSource(d.id)), locked))}
      {btn('delivery-custom', `${source === 'custom' ? '✓ ' : ''}${say('내가 가진 기준 녹음 사용', 'Use my own reference recording')}`, () => change(() => setSource('custom')), locked)}
      {source === 'custom' ? <>
        <Text style={styles.caption}>{say('아래 첨부 메뉴로 선생님 등 사용 허락을 받은 음성을 추가한 뒤 선택하세요.', 'Attach a reference you have permission to use, such as your teacher’s recording, then select it below.')}</Text>
        <TextInput testID="delivery-reference-text" value={customText} maxLength={160} multiline editable={!locked} onChangeText={v => change(() => setCustomText(v))}
          accessibilityLabel={say('기준 녹음의 한국어 대사', 'Korean words spoken in the reference')} placeholder={say('기준 녹음에 나온 대사를 그대로 적기', 'Enter the exact Korean line')} style={styles.input} />
        {takes.map((t, i) => btn(`delivery-target-${i}`, `${targetUri === t.uri ? '✓ ' : ''}${say('기준 녹음', 'Reference')} ${i + 1}${t.name ? ` · ${t.name}` : ''}`, () => change(() => { setTargetUri(t.uri); if (uri === t.uri) setUri(''); }), locked))}
      </> : <Text style={styles.caption}>{say('기본 음성은 AI 합성 음성입니다. 공인된 표준 발음·억양의 정답이 아니며, 아래에서 직접 듣고 연습 기준으로 선택하세요.', 'Built-in voices are AI-generated practice examples, not certified pronunciation or intonation standards. Listen before choosing one as your target.')}</Text>}
      {loading && <Text>{say('연습 음성 불러오는 중…', 'Loading practice voices…')}</Text>}
      {(!drills.length || !available || error === 'REFERENCE_CHANGED') && btn('delivery-reload', say('연습 음성 다시 불러오기', 'Reload practice voices'), load, loading || locked)}
      {btn('delivery-listen-target', say('기준 음성 듣기', 'Listen to reference'), () => play(target), locked || !target)}
      {!!reference && <Text style={styles.script}>{reference}</Text>}
      <Text style={styles.step}>{say('2. 같은 대사를 내 목소리로', '2. Record the same line')}</Text>
      {btn('delivery-record', recording ? say('녹음 마치기', 'Finish recording') : takes.length ? say('다시 녹음하기 · 이전 녹음 유지', 'Record again · keep previous takes') : say('내 목소리 녹음하기', 'Record my voice'), recording ? onStop : onRecord, busy || running || !reference)}
      {takes.filter(t => t.uri !== targetUri || source !== 'custom').map(t => {
        const i = takes.findIndex(a => a.uri === t.uri);
        return btn(`delivery-take-${i}`, `${uri === t.uri ? '✓ ' : ''}${say('내 녹음', 'My take')} ${i + 1}`, () => change(() => setUri(t.uri)), locked);
      })}
      {btn('delivery-listen-attempt', say('내 녹음 먼저 듣기', 'Listen to my take first'), () => play(uri), locked || !uri)}
      <TouchableOpacity testID="delivery-consent" accessibilityRole="checkbox" accessibilityState={{ checked: consent, disabled: locked }} disabled={locked} onPress={() => setConsent(v => !v)} style={styles.consent}>
        <Text>{consent ? '☑ ' : '☐ '}{say('선택한 녹음과 대사를 아트링크·OpenAI에 보내 분석하는 데 동의합니다. 직접 고른 기준 음성은 분석에 사용할 권한이 있습니다. 서버 임시 음성은 처리 후 삭제됩니다.', 'I consent to sending the selected audio and line to ArtLink and OpenAI for analysis. I have permission to use any reference I selected. Temporary server audio is deleted after processing.')}</Text>
      </TouchableOpacity>
      <Text style={styles.caption}>{say('녹음당 0.4~30초·1.4MB 이하. 녹음 점검과 합쳐 최근 24시간 5회. 대사를 다르게 읽거나 분석이 불확실하면 교정 안내를 만들지 않습니다.', '0.4–30 seconds and under 1.4 MB per take. Five checks/comparisons per rolling 24 hours. No coaching is generated when the words differ or analysis is uncertain.')}</Text>
      {!accountId && <Text>{message.LOGIN_REQUIRED}</Text>}
      {btn('delivery-compare', running ? say('같은 구간 비교 중…', 'Comparing matching segments…') : say('높낮이·길이 비교하기', 'Compare pitch movement & timing'), run, locked || !available || !consent || !accountId || !uri || !target || !reference || uri === target)}
      {!!error && <Text accessibilityRole="alert">{message[error] || say('비교를 완료하지 못했어요. 녹음은 그대로 남아 있습니다. 다시 시도해주세요.', 'Could not finish the comparison. Your recordings are unchanged. Please retry.')}</Text>}
      {selected && <View testID="delivery-result" style={styles.content}>
        {selected.status !== 'compared' ? <Text>{selected.status === 'text_uncertain' ? say('같은 대사와 구간을 확실히 확인하지 못했어요. 대사를 확인하고 음악 없이 한 사람만 다시 녹음해주세요. 발음이 틀렸다는 뜻은 아닙니다.', 'The same words and timing could not be confirmed. Check the line and record one voice without music. This does not mean your pronunciation is wrong.') : say('음높이를 안정적으로 비교할 구간이 부족해요. 조용한 곳에서 편한 목소리로 다시 녹음해주세요.', 'Not enough reliable pitch could be measured. Record again in a quiet place with your normal voice.')}</Text> : <>
          <Text style={styles.step}>{say('3. 이 구간부터 다시 연습', '3. Rehearse these segments')}</Text>
          <Text style={styles.caption}>{say('선택한 기준과의 차이입니다. 지역 말투·발음의 정오나 연기 실력 점수가 아닙니다. 자음·모음 오류는 판정하지 않습니다.', 'Differences from your selected reference, not a dialect, pronunciation or acting score. Consonant and vowel errors are not assessed.')}</Text>
          <Text style={styles.caption}>{say('초록 점선: 기준 · 분홍 실선: 내 녹음. 목소리 높이의 기준점을 맞췄으며, 빈 구간은 측정하지 못한 부분입니다.', 'Green dashed: reference · pink solid: your take. Pitch baselines are normalized. Gaps mark unmeasured parts.')}</Text>
          {!selected.suggestions.length && <Text>{say('이번 비교에서는 연습 대상으로 표시할 만큼 큰 높낮이·길이 차이가 없었어요. 모든 발음이 정확하다는 판정은 아닙니다.', 'No pitch/timing difference exceeded the practice threshold. This is not a finding that every sound was pronounced correctly.')}</Text>}
          {selected.segments.map(s => {
            const suggestion = selected.suggestions.find(a => a.index === s.index), old = previous?.segments.find(a => a.index === s.index);
            return <View key={s.index} testID={`delivery-segment-${s.index}`} style={styles.segment}>
              <Text style={styles.word}>{s.word} · {sec(s.attempt.start)}–{sec(s.attempt.end)}</Text>
              <Text>{say('기준', 'Reference')}: {trend(s.target.change)} · {say('내 녹음', 'My take')}: {trend(s.attempt.change)}</Text>
              <PitchLines target={s.target.curve} attempt={s.attempt.curve} label={`${s.word}, ${say('기준', 'reference')} ${trend(s.target.change)}, ${say('내 녹음', 'my take')} ${trend(s.attempt.change)}`} />
              {suggestion && <Text style={styles.advice}>{advice(suggestion.direction)}</Text>}
              {btn(`delivery-target-segment-${s.index}`, say('기준의 이 구간 듣기', 'Listen to reference segment'), () => play(target, Math.max(0, s.target.start - 0.12), s.target.end + 0.12), locked)}
              {btn(`delivery-attempt-segment-${s.index}`, say('내 녹음의 이 구간 듣기', 'Listen to my segment'), () => play(uri, Math.max(0, s.attempt.start - 0.12), s.attempt.end + 0.12), locked)}
              {old && <Text testID={`delivery-progress-${s.index}`} style={styles.caption}>{say('기준 대비 높낮이 변화 차이', 'Difference from reference pitch movement')}: {Math.abs(old.pitchDelta).toFixed(1)} → {Math.abs(s.pitchDelta).toFixed(1)} {say('반음. 작을수록 이번 기준에 가까운 측정값입니다.', 'semitones. Smaller means closer to this reference measurement.')}</Text>}
            </View>;
          })}
          <Text style={styles.caption}>{say('분석할 수 있었던 구간', 'Measurable segments')}: {selected.coverage?.compared} / {selected.coverage?.total}</Text>
          {onAppendSummary && btn('delivery-summary', say('연습할 내용 노트에 추가', 'Add practice guidance to note'), keep, locked)}
          <Text style={styles.caption}>{say('상세 결과는 이 화면에만 남습니다. 보관하려면 노트에 추가하고 저장하세요.', 'Details stay on this screen. Add them to your note and save to keep a record.')}</Text>
        </>}
      </View>}
    </View>}
  </View>;
});
const styles = StyleSheet.create({
  card: { padding: 18, marginVertical: 12, borderRadius: 18, backgroundColor: '#F4F6F2', borderWidth: 1, borderColor: '#DCE3DB' },
  headingButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44, gap: 8 },
  heading: { flex: 1, fontSize: 19, fontWeight: '700', color: '#213B32' }, content: { gap: 10, marginTop: 12 },
  step: { fontSize: 16, fontWeight: '700', color: '#213B32', marginTop: 10 }, caption: { fontSize: 12, lineHeight: 19, color: '#53655B' },
  button: { minHeight: 44, justifyContent: 'center', padding: 12, borderRadius: 10, backgroundColor: '#E0ECE4' },
  disabled: { opacity: 0.5 }, buttonText: { color: '#234C3B', fontWeight: '600' },
  input: { minHeight: 72, padding: 12, borderWidth: 1, borderColor: '#BCCDBF', borderRadius: 10, backgroundColor: '#FFFFFF' },
  script: { fontSize: 19, lineHeight: 29, paddingVertical: 8, color: '#213B32' }, consent: { minHeight: 44, paddingVertical: 10 },
  segment: { padding: 14, gap: 8, borderRadius: 12, backgroundColor: '#FFFFFF' }, word: { fontSize: 17, fontWeight: '700', color: '#213B32' },
  advice: { fontSize: 15, lineHeight: 23, color: '#6A2942' }, graph: { backgroundColor: '#FAFBF9', borderRadius: 8 }
});
