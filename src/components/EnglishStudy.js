import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { STUDIO as C } from '../constants/studioTheme';
import study from '../data/english-study.json';

// Bind meanings to exact bundled text: private/changed scenes must never inherit a lesson.
export function lessonFor(scene) {
  const lesson = !scene?.isPrivate && scene?.language === 'en' && study[scene.id];
  return lesson && lesson.lines.length === scene.lines.length && lesson.lines.every((line, i) => line.text === scene.lines[i].t) ? lesson : null;
}

export default function EnglishStudy({ scene, language, canSpeak, onListen, onStop, onPractice }) {
  const [index, setIndex] = useState(0);
  const [hidden, setHidden] = useState(false);
  const [meaning, setMeaning] = useState(false);
  const ko = language === 'ko';
  const lesson = lessonFor(scene);
  if (!lesson) return null;
  const line = lesson.lines[index];
  const move = (step) => { onStop(); setIndex(index + step); setHidden(false); setMeaning(false); };
  const button = (id, label, action, disabled = false, primary = false) => (
    <TouchableOpacity testID={id} accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={action} style={[s.button, primary && s.primary, disabled && s.disabled]}>
      <Text style={[s.buttonText, primary && s.white]}>{label}</Text>
    </TouchableOpacity>
  );
  return <ScrollView testID="english-study" contentContainerStyle={s.page}>
    <Text style={s.eyebrow}>{ko ? '의미 이해 → 듣고 따라 말하기 → 가리고 연기하기' : 'Understand → Listen and repeat → Rehearse from memory'}</Text>
    <Text style={s.title}>{ko ? '말뜻을 알고, 내 말로.' : 'Understand it. Make it yours.'}</Text>
    <Text style={s.body}>{ko ? '한 줄씩 듣고 직접 따라 말하세요. 준비되면 대사를 가리고 같은 뜻을 건네보세요.' : 'Listen to each line and say it aloud. Then hide the words and speak with the same intention.'}</Text>
    <View style={s.card}>
      <Text accessibilityLiveRegion="polite" style={s.eyebrow}>{index + 1} / {lesson.lines.length} · {scene.roles[scene.lines[index].r].name}</Text>
      <Text testID="study-line" style={s.dialogue}>{hidden ? (ko ? '대사를 떠올려 말해보세요.' : 'Say the line from memory.') : line.text}</Text>
      {button('study-hide', hidden ? (ko ? '대사 다시 보기' : 'Reveal line') : (ko ? '대사 가리기' : 'Hide line'), () => { onStop(); setHidden(!hidden); setMeaning(false); })}
      {button('study-meaning', meaning ? (ko ? '뜻 닫기' : 'Hide Korean meaning') : (ko ? '한국어 뜻 보기' : 'Show Korean meaning'), () => setMeaning(!meaning))}
      {meaning && <Text testID="study-translation" style={s.meaning}>{line.ko}</Text>}
      {canSpeak ? button('study-listen', ko ? '이 줄 듣기 · 다시 듣기' : 'Listen / Replay', () => onListen(line.text), false, true) : <Text style={s.body}>{ko ? '이 앱 버전에서는 음성을 재생할 수 없습니다. 대사를 소리 내어 읽어주세요.' : 'Audio is unavailable in this app version. Read the line aloud.'}</Text>}
      <Text style={s.small}>{ko ? '기기 음성으로 재생합니다. 이 화면은 녹음하거나 발음을 채점하지 않습니다.' : 'Uses your device voice. This screen does not record or score pronunciation.'}</Text>
    </View>
    <View style={s.row}>
      {button('study-previous', ko ? '이전 줄' : 'Previous', () => move(-1), index === 0)}
      {button('study-next', ko ? '다음 줄' : 'Next', () => move(1), index === lesson.lines.length - 1)}
    </View>
    {!hidden && <View style={s.card}>
      <Text style={s.heading}>{ko ? '이 장면의 표현' : 'Expressions in this scene'}</Text>
      {lesson.expressions.map(item => <View key={item.phrase} style={s.expression}><Text style={s.heading}>{item.phrase}</Text><Text style={s.body}>{ko ? item.ko : item.en}</Text></View>)}
    </View>}
    {button('study-practice', ko ? '내 역할로 장면 연습하기 →' : 'Rehearse my role →', () => { onStop(); onPractice(); }, false, true)}
    <Text style={s.small}>{ko ? '장면 연습에서 녹음하고 노트로 옮길 수 있습니다. AI 피드백은 노트에서 직접 요청합니다.' : 'Record in rehearsal and move your take to a note. Request AI feedback from the note when ready.'}</Text>
  </ScrollView>;
}
const s = StyleSheet.create({
  page: { padding: 20, paddingBottom: 40, gap: 16 },
  eyebrow: { fontSize: 12, lineHeight: 19, color: C.positive, fontWeight: '700' },
  title: { fontSize: 27, fontWeight: '800', color: C.ink },
  body: { color: C.muted, fontSize: 15, lineHeight: 23 },
  card: { backgroundColor: C.paper, borderRadius: 20, padding: 20, gap: 12, borderWidth: 1, borderColor: C.line },
  dialogue: { fontSize: 25, lineHeight: 36, color: C.ink, paddingVertical: 12 },
  heading: { color: C.ink, fontSize: 16, fontWeight: '700' },
  meaning: { color: C.ink, fontSize: 17, lineHeight: 26, backgroundColor: C.accentSoft, padding: 12, borderRadius: 10 },
  button: { minHeight: 48, padding: 13, justifyContent: 'center', alignItems: 'center', borderRadius: 12, backgroundColor: C.quiet, flexShrink: 1 },
  buttonText: { color: C.ink, fontWeight: '700', fontSize: 15 }, primary: { backgroundColor: '#AD194A' }, white: { color: '#FFF' }, disabled: { opacity: .4 },
  row: { flexDirection: 'row', gap: 12 }, small: { fontSize: 12, lineHeight: 19, color: C.muted }, expression: { gap: 5, marginTop: 8 },
});
