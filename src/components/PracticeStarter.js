import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import starters from '../data/practice-starters.json';
import { STUDIO as C } from '../constants/studioTheme';

export function starterPrefill(field, language, focusIndex = 0) {
  const copy = starters[field]?.[String(language).startsWith('ko') ? 'ko' : 'en'];
  if (!copy || !Number.isInteger(focusIndex) || !copy.focus[focusIndex]) return null;
  return { field, intent: 'material', title: copy.title,
    content: copy.prompts.map(prompt => `${prompt}:\n`).join('\n') + `\n${String(language).startsWith('ko') ? '이번에 확인할 점' : 'Focus for this practice'}: ${copy.focus[focusIndex]}` };
}
export default function PracticeStarter({ fields = [], language, onStart, compact = false }) {
  const [field, setField] = useState(() => fields.find(f => starters[f]) || 'acting');
  const [focus, setFocus] = useState(0);
  const picked = useRef(false);
  const preferred = fields.find(f => starters[f]);
  useEffect(() => { if (!picked.current && preferred) { setField(preferred); setFocus(0); } }, [preferred]);
  const [expanded, setExpanded] = useState(!compact);
  const ko = String(language).startsWith('ko');
  const copy = starters[field][ko ? 'ko' : 'en'];
  return <View style={s.card} testID="practice-starter">
    <Text style={s.eyebrow}>{ko ? '내 분야로 시작하기' : 'START WITH YOUR ART'}</Text>
    <View style={s.wrap}>{Object.entries(starters).map(([id, value]) => <TouchableOpacity key={id} testID={`starter-field-${id}`} accessibilityRole="button" accessibilityState={{ selected: field === id }} onPress={() => { picked.current = true; setField(id); setFocus(0); setExpanded(true); }} style={[s.chip, field === id && s.selected]}><Text style={[s.chipText, field === id && s.selectedText]}>{value[ko ? 'ko' : 'en'].name}</Text></TouchableOpacity>)}</View>
    {!expanded && <Text style={s.body}>{ko ? "분야를 고르면 자료와 연습 목표를 정리할 수 있어요." : "Choose an art form to prepare your material and practice goal."}</Text>}
    {expanded && <>
    <Text style={s.title}>{copy.title}</Text><Text style={s.body}>{copy.intro}</Text>
    <Text style={s.label}>{ko ? '이번에 확인할 점 하나' : 'One focus for this practice'}</Text>
    {copy.focus.map((item, index) => <TouchableOpacity key={item} testID={`starter-focus-${index}`} accessibilityRole="radio" accessibilityState={{ checked: focus === index }} onPress={() => setFocus(index)} style={[s.choice, focus === index && s.selected]}><Text style={s.body}>{focus === index ? '●' : '○'}  {item}</Text></TouchableOpacity>)}
    <TouchableOpacity testID="starter-open" accessibilityRole="button" onPress={() => onStart(starterPrefill(field, ko ? 'ko' : 'en', focus))} style={s.primary}><Text style={s.white}>{ko ? `${copy.name} 자료와 목표 남기기 →` : `Start my ${copy.name.toLowerCase()} note →`}</Text></TouchableOpacity>
    <Text style={s.notice}>{copy.notice}</Text>
    </>}
  </View>;
}
const s = StyleSheet.create({
  card: { marginBottom: 20, padding: 20, gap: 12, borderWidth: 1, borderColor: C.line, borderRadius: 20, backgroundColor: C.paper },
  eyebrow: { color: C.positive, fontSize: 12, fontWeight: '700' }, wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { padding: 12, minHeight: 44, borderRadius: 24, backgroundColor: C.quiet }, selected: { backgroundColor: C.accentSoft, borderColor: C.accent, borderWidth: 1 },
  chipText: { color: C.ink, fontSize: 14 }, selectedText: { color: '#AD194A', fontWeight: '700' },
  title: { fontSize: 22, lineHeight: 30, color: C.ink, fontWeight: '800' }, body: { fontSize: 15, lineHeight: 23, color: C.ink },
  label: { fontSize: 13, fontWeight: '700', color: C.muted, marginTop: 6 }, choice: { padding: 12, minHeight: 48, borderRadius: 12, backgroundColor: C.background },
  primary: { minHeight: 50, justifyContent: 'center', alignItems: 'center', padding: 14, borderRadius: 12, backgroundColor: '#AD194A' }, white: { color: '#fff', fontSize: 15, fontWeight: '700' },
  notice: { fontSize: 12, lineHeight: 19, color: C.muted },
});
