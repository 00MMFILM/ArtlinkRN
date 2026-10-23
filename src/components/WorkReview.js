import React, { useEffect, useMemo, useRef, useState } from "react";
import { AppState, View, Text, TextInput, TouchableOpacity, StyleSheet } from "react-native";
import { Audio } from "expo-av";
import { STUDIO as C } from "../constants/studioTheme";
import { audioAttachments, paragraphDiff, reviewNotes, reviewRange } from "../utils/workReview";

const ignore = promise => Promise.resolve(promise).catch(() => {});
const stamp = ms => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}`;

// One sound owns playback. Late load results are unloaded after a switch,
// account change, background transition or unmount.
export function MusicLoop({ note, previousNote, visible, stopSignal, beforePlay, onAnchor, ko }) {
  const choices = useMemo(() => [
    ...audioAttachments(previousNote).map((file, i) => ({ ...file, label: `${ko ? "이전" : "Previous"} ${i + 1}` })),
    ...audioAttachments(note).map((file, i) => ({ ...file, reviewSide: note.webReview ? (i === 0 ? "a" : i === 1 ? "b" : null) : null, label: `${note.webReview && i < 2 ? (i === 0 ? "A" : "B") : (ko ? "현재" : "Current")} ${i + 1}` })),
  ], [note, previousNote, ko]);
  const [index, setIndex] = useState(0);
  const importedSettings = note.webReview?.review?.settings || previousNote?.webReview?.review?.settings || {};
  const [start, setStart] = useState(String(importedSettings.start ?? 0)), [end, setEnd] = useState(String(importedSettings.end ?? 10)), [rate, setRate] = useState(importedSettings.rate || 1);
  const [message, setMessage] = useState(""), [playing, setPlaying] = useState(false);
  const [repeat, setRepeat] = useState(importedSettings.loop !== false);
  const sound = useRef(null), token = useRef(0), mounted = useRef(true), position = useRef(0), loopBusy = useRef(false);
  const available = useRef(visible), file = choices[index];
  available.current = visible;
  const stop = () => {
    token.current++; const old = sound.current; sound.current = null;
    const released = old ? Promise.resolve().then(() => old.unloadAsync()).catch(() => {}) : Promise.resolve();
    loopBusy.current = false;
    if (mounted.current) setPlaying(false);
    return released;
  };
  useEffect(() => {
    mounted.current = true;
    const listener = AppState.addEventListener("change", state => { if (state !== "active") stop(); });
    return () => { mounted.current = false; stop(); listener.remove(); };
  }, []);
  useEffect(() => { if (!visible) stop(); }, [visible]);
  useEffect(() => { stop(); }, [stopSignal]);
  useEffect(() => {
    stop(); position.current = 0;
    if (note.webReview && file?.reviewSide && importedSettings.start !== undefined) {
      const offset = file.reviewSide === "b" ? importedSettings.offset || 0 : 0;
      setStart(String(importedSettings.start + offset)); setEnd(String(importedSettings.end + offset));
    }
  }, [file?.uri]);

  const play = async () => {
    if (!file || !available.current) return;
    const released = stop(); const request = token.current;
    const current = () => mounted.current && available.current && request === token.current;
    const fail = () => { if (current()) { stop(); setMessage(ko ? "녹음을 열 수 없어요. 파일이 이 기기에 있는지 확인해주세요." : "Could not open this recording. Check that the file is on this device."); } };
    try {
      await released;
      if (!current()) return;
      await beforePlay?.();
      if (!current()) return;
      await Audio.setAudioModeAsync({ playsInSilentModeIOS: true, staysActiveInBackground: false });
      if (!current()) return;
      const loaded = await Audio.Sound.createAsync({ uri: file.uri }, { shouldPlay: false, progressUpdateIntervalMillis: 80 });
      if (!current()) { ignore(loaded.sound.unloadAsync()); return; }
      sound.current = loaded.sound;
      const range = reviewRange(start, end, (loaded.status.durationMillis || 0) / 1000);
      if (!range) {
        const duration = (loaded.status.durationMillis || 0) / 1000;
        stop(); setMessage(ko ? `시작·끝을 파일 길이(${duration.toFixed(1)}초) 안에서 정해주세요.` : `Set start and end within the file (${duration.toFixed(1)}s).`);
        return;
      }
      loaded.sound.setOnPlaybackStatusUpdate(status => {
        if (!current()) return;
        if (!status.isLoaded) { if (status.error) fail(); return; }
        position.current = status.positionMillis || 0;
        if ((position.current >= range.end || status.didJustFinish) && !repeat) { stop(); return; }
        if ((position.current >= range.end || status.didJustFinish) && !loopBusy.current) {
          loopBusy.current = true;
          loaded.sound.setPositionAsync(range.start).then(async () => {
            if (current()) await loaded.sound.playAsync();
          }).catch(fail).finally(() => { if (current()) loopBusy.current = false; });
        }
      });
      await loaded.sound.setRateAsync(rate, true);
      if (!current()) return;
      await loaded.sound.setPositionAsync(range.start);
      if (!current()) return;
      await loaded.sound.playAsync();
      if (current()) { setPlaying(true); setMessage(repeat ? (ko ? "선택한 구간을 반복하고 있어요." : "Looping your selected range.") : (ko ? "선택한 구간을 한 번 재생합니다." : "Playing the range once.")); }
    } catch { fail(); }
  };
  if (!choices.length) return <Text style={s.small}>{ko ? "녹음 파일을 첨부하면 구간 반복과 시점 메모를 쓸 수 있어요." : "Attach a recording to loop a phrase and leave time notes."}</Text>;
  return <View style={s.group}>
    {!!note.webReview && <Text style={s.small}>{ko ? "첨부한 첫 파일은 A, 두 번째는 B 구간으로 열립니다. 웹에서 비교했던 파일인지 확인해주세요." : "The first attached file uses range A, the second uses B. Check that they match the files you compared on the web."}</Text>}
    <View style={s.row}>{choices.map((choice, i) => <TouchableOpacity key={`${choice.uri}:${i}`} style={[s.chip, i === index && s.selected]} accessibilityRole="button" accessibilityState={{ selected: i === index }} onPress={() => { stop(); setIndex(i); setMessage(""); }}><Text style={s.body}>{choice.label}</Text></TouchableOpacity>)}</View>
    <View style={s.row}>
      <View style={s.flex}><Text style={s.small}>{ko ? "시작(초)" : "Start (s)"}</Text><TextInput testID="review-start" accessibilityLabel={ko ? "시작 초" : "Start seconds"} style={s.input} keyboardType="decimal-pad" value={start} onChangeText={v => { stop(); setStart(v); }} /></View>
      <View style={s.flex}><Text style={s.small}>{ko ? "끝(초)" : "End (s)"}</Text><TextInput testID="review-end" accessibilityLabel={ko ? "끝 초" : "End seconds"} style={s.input} keyboardType="decimal-pad" value={end} onChangeText={v => { stop(); setEnd(v); }} /></View>
    </View>
    <View style={s.row}>{[0.5, 0.75, 1, 1.25].map(value => <TouchableOpacity key={value} style={[s.chip, rate === value && s.selected]} accessibilityRole="button" accessibilityState={{ selected: rate === value }} onPress={() => { stop(); setRate(value); }}><Text style={s.body}>{value}×</Text></TouchableOpacity>)}</View>
    <TouchableOpacity testID="review-repeat" accessibilityRole="switch" accessibilityState={{ checked: repeat }} style={s.chip} onPress={() => { stop(); setRepeat(value => !value); }}><Text style={s.body}>{ko ? `구간 반복: ${repeat ? "켜짐" : "꺼짐"}` : `Repeat: ${repeat ? "on" : "off"}`}</Text></TouchableOpacity>
    <View style={s.row}><TouchableOpacity testID="review-play" style={s.primary} accessibilityRole="button" onPress={playing ? stop : play}><Text style={s.white}>{playing ? (ko ? "멈춤" : "Stop") : (repeat ? (ko ? "구간 반복" : "Loop phrase") : (ko ? "구간 재생" : "Play range"))}</Text></TouchableOpacity>
      <TouchableOpacity testID="review-time-note" style={s.chip} accessibilityRole="button" onPress={() => onAnchor(`${file.label} · ${stamp(position.current)}`)}><Text style={s.body}>{ko ? "현재 시점에 메모" : "Note this moment"}</Text></TouchableOpacity></View>
    {!!message && <Text accessibilityRole="alert" style={s.small}>{message}</Text>}
  </View>;
}

export default function WorkReview({ note, previousNote, language, visible, stopSignal, beforePlay, onSave, disabled, draft, onDraftChange }) {
  const ko = String(language).startsWith("ko"), literary = note.field === "literature";
  const { body = "", anchor = "" } = draft || {};
  const setBody = body => onDraftChange({ body, anchor });
  const setAnchor = anchor => onDraftChange({ body, anchor });
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const lock = useRef(false), mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const notes = reviewNotes(note.workReviewNotes);
  const originalText = previousNote?.content ?? note.webReview?.review?.texts?.a;
  const hasOriginal = typeof originalText === "string";
  const rows = useMemo(() => literary && hasOriginal ? paragraphDiff(originalText, note.content) : [], [literary, originalText, note.content]);
  const save = async next => {
    if (lock.current || disabled) return false;
    lock.current = true; setBusy(true);
    try { await onSave(next); if (mounted.current) setMessage(ko ? "검토 메모를 저장했어요." : "Review notes saved."); return true; }
    catch { if (mounted.current) setMessage(ko ? "저장하지 못했어요. 메모는 그대로 남아 있어요." : "Could not save. Your draft is still here."); return false; }
    finally { lock.current = false; if (mounted.current) setBusy(false); }
  };
  if (!["music", "literature"].includes(note.field) && !note.webReview) return null;
  return <View testID="work-review" style={s.card}>
    <Text style={s.title}>{literary ? (ko ? "문단별 퇴고" : "Revision review") : note.field === "music" ? (ko ? "한 구간, 다시 듣기" : "Listen to one phrase again") : (ko ? "웹에서 이어온 검토 메모" : "Review notes from the studio")}</Text>
    {literary ? hasOriginal ? rows ? <View style={s.group}>
      <Text style={s.small}>{ko ? "− 이전 문단 · + 수정 문단. 문단을 눌러 수정 이유를 남기세요." : "− Previous · + Revised. Tap a passage to leave a note."}</Text>
      {rows.map((row, i) => <TouchableOpacity testID={`revision-line-${i}`} key={i} accessibilityRole="button" style={[s.passage, row.kind === "add" && s.add, row.kind === "remove" && s.remove]} onPress={() => setAnchor(`${row.kind === "remove" ? (ko ? "이전" : "Previous") : (ko ? "현재" : "Current")} ${row.line} · ${row.text.slice(0, 300)}`)}><Text style={s.body}>{row.kind === "add" ? "+ " : row.kind === "remove" ? "− " : ""}{row.text || " "}</Text></TouchableOpacity>)}
    </View> : <View style={s.group}><Text style={s.small}>{ko ? "문단이 많아 차이 표시를 생략했어요. 원문은 아래에 보존했습니다." : "Too many paragraphs to highlight changes. The original is preserved below."}</Text><Text selectable style={s.body}>{originalText}</Text></View>
      : <Text style={s.small}>{ko ? "‘다시 연습’으로 수정본을 남기면 원문과 문단별로 비교할 수 있어요." : "Use Practice again to save a revision and compare it with the original."}</Text>
      : note.field === "music" ? <MusicLoop note={note} previousNote={previousNote} ko={ko} visible={visible} stopSignal={stopSignal} beforePlay={beforePlay} onAnchor={setAnchor} /> : null}
    <Text style={s.small}>{anchor || (ko ? "작업 전체에 남기는 메모" : "Note for the whole work")}</Text>
    <TextInput testID="review-note-input" style={s.input} accessibilityLabel={ko ? "검토 메모" : "Review note"} placeholder={ko ? "다음 수정에서 바꿀 점" : "What to change next"} multiline maxLength={1000} value={body} editable={!busy && !disabled} onChangeText={setBody} />
    <TouchableOpacity testID="review-save" accessibilityRole="button" disabled={busy || disabled || !body.trim() || notes.length >= 101} style={[s.primary, (busy || disabled || !body.trim()) && s.dim]} onPress={async () => {
      if (!body.trim() || notes.length >= 101) return;
      if (await save([...notes, { id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`, label: anchor, body: body.trim(), resolved: false }])) {
        if (mounted.current) onDraftChange({ body: "", anchor: "" });
      }
    }}><Text style={s.white}>{ko ? "메모 저장" : "Save note"}</Text></TouchableOpacity>
    {notes.map((item, i) => <View key={item.id} style={s.passage}><Text style={s.small}>{i + 1}. {item.label}</Text><Text style={[s.body, item.resolved && s.dim]}>{item.body}</Text><TouchableOpacity accessibilityRole="button" disabled={busy || disabled} style={s.chip} onPress={() => save(notes.map(n => n.id === item.id ? { ...n, resolved: !n.resolved } : n))}><Text style={s.body}>{item.resolved ? (ko ? "다시 검토" : "Reopen") : (ko ? "해결 표시" : "Mark resolved")}</Text></TouchableOpacity></View>)}
    {notes.length >= 101 && <Text style={s.small}>{ko ? "이 기록에는 메모 101개까지 저장할 수 있어요." : "This entry holds up to 101 review notes."}</Text>}
    {!!message && <Text accessibilityRole="alert" style={s.small}>{message}</Text>}
    <Text style={s.small}>{ko ? "직접 검토하는 도구라 AI 이용 횟수를 쓰지 않아요. 원본 본문은 바뀌지 않습니다." : "Self-review does not use AI credits. Your original text stays unchanged."}</Text>
  </View>;
}
const s = StyleSheet.create({
  card: { padding: 18, marginVertical: 12, borderWidth: 1, borderColor: C.line, borderRadius: 20, backgroundColor: C.paper, gap: 12 },
  title: { color: C.ink, fontSize: 22, fontWeight: "700" }, body: { color: C.ink, fontSize: 14, lineHeight: 22 },
  small: { color: C.muted, fontSize: 12, lineHeight: 19 }, group: { gap: 10 }, row: { flexDirection: "row", flexWrap: "wrap", gap: 8 }, flex: { flex: 1 },
  input: { borderWidth: 1, borderColor: C.line, borderRadius: 10, padding: 12, minHeight: 46, color: C.ink, backgroundColor: "#FFF" },
  chip: { minHeight: 44, padding: 10, backgroundColor: C.quiet, borderRadius: 12, justifyContent: "center" }, selected: { backgroundColor: C.accentSoft },
  primary: { minHeight: 48, padding: 14, backgroundColor: "#AD194A", borderRadius: 12, justifyContent: "center", alignItems: "center" },
  white: { color: "#FFF", fontWeight: "700" }, passage: { padding: 10, borderRadius: 8, backgroundColor: C.quiet, gap: 6 },
  add: { backgroundColor: "#E6F2E9" }, remove: { backgroundColor: "#F9E6E2" }, dim: { opacity: 0.5 },
});
