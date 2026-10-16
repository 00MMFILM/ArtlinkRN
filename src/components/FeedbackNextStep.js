import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { STUDIO as C } from '../constants/studioTheme';
import FocusPicker from './FocusPicker';
import { feedbackHighlights, nextFeedbackFocus } from '../utils/feedbackHighlights';

export default function FeedbackNextStep({ feedback, options, selected, onSelect, onRetry, onCompare, language = 'en', field, disabled = false, actionLabel }) {
  const [expanded, setExpanded] = useState(() => Object.keys(feedbackHighlights(feedback)).length === 0);
  const ko = String(language).startsWith('ko');
  const { strength, evidence, exercise } = feedbackHighlights(feedback);
  const focus = nextFeedbackFocus(options, selected);
  const copy = ko ? {
    title: '다음에는 이것 하나', strength: '잘된 점', change: '이번에 고칠 점', evidence: '피드백의 근거', exercise: '연습 방법',
    choose: '다른 초점 고르기', retry: field === 'art' ? '저장하고 수정본 남기기' : '저장하고 다시 연습하기',
    detail: '전체 피드백 보기', close: '전체 피드백 접기', compare: '저장하고 이전 기록과 비교',
    hint: '새 AI 피드백을 요청할 때 기존 이용 한도가 적용됩니다.',
  } : {
    title: 'ONE THING FOR YOUR NEXT TAKE', strength: 'What worked', change: 'Next focus', evidence: 'Evidence in the feedback', exercise: 'Next exercise',
    choose: 'Choose another focus', retry: field === 'art' ? 'Save and add a revision' : 'Save and practice again',
    detail: 'Read full feedback', close: 'Hide full feedback', compare: 'Save and compare with the previous entry',
    hint: 'Your existing allowance applies when you request new AI feedback.',
  };
  return <View testID="feedback-next-step" style={s.card}>
    <Text style={s.eyebrow}>{copy.title}</Text>
    {strength ? <View><Text style={s.label}>{copy.strength}</Text><Text style={s.body}>{strength}</Text></View> : null}
    {focus ? <Text style={s.focus}>{copy.change}: {focus}</Text> : null}
    {evidence ? <View><Text style={s.label}>{copy.evidence}</Text><Text style={s.body}>{evidence}</Text></View> : null}
    {exercise ? <View><Text style={s.label}>{copy.exercise}</Text><Text style={s.body}>{exercise}</Text></View> : null}
    {onRetry ? <TouchableOpacity testID="feedback-retry-practice" accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} style={[s.primary, disabled && s.disabled]} onPress={() => onRetry(focus)}><Text style={s.primaryText}>{actionLabel || copy.retry}</Text></TouchableOpacity> : null}
    {onCompare ? <TouchableOpacity testID="feedback-compare" accessibilityRole="button" disabled={disabled} style={s.secondary} onPress={onCompare}><Text style={s.link}>{copy.compare}</Text></TouchableOpacity> : null}
    <Text style={s.hint}>{copy.hint}</Text>
    <TouchableOpacity testID="feedback-expand" accessibilityRole="button" accessibilityState={{ expanded }} style={s.secondary} onPress={() => setExpanded(value => !value)}><Text style={s.link}>{expanded ? copy.close : copy.detail} {expanded ? '−' : '+'}</Text></TouchableOpacity>
    {expanded ? <View style={s.details}>
      <Text selectable style={s.body}>{feedback}</Text>
      <FocusPicker title={copy.choose} options={options} value={selected} disabled={disabled} onSelect={onSelect} />
    </View> : null}
  </View>;
}
const s = StyleSheet.create({
  card: { backgroundColor: C.paper, borderWidth: 1, borderColor: C.line, borderRadius: 20, padding: 18, gap: 14, marginVertical: 12 },
  eyebrow: { color: C.positive, fontWeight: '700', fontSize: 12, letterSpacing: 0.8 },
  label: { color: C.muted, fontSize: 12, fontWeight: '600', marginBottom: 5 },
  body: { color: C.ink, fontSize: 15, lineHeight: 24 }, focus: { color: C.ink, fontSize: 20, fontWeight: '700', lineHeight: 29 },
  primary: { backgroundColor: C.accent, padding: 16, minHeight: 52, borderRadius: 14, alignItems: 'center' },
  primaryText: { color: '#fff', fontSize: 15, fontWeight: '700' }, disabled: { opacity: 0.45 },
  secondary: { minHeight: 44, justifyContent: 'center' }, link: { color: C.ink, fontWeight: '600', fontSize: 14 },
  hint: { color: C.muted, fontSize: 12, lineHeight: 18 }, details: { gap: 12 },
});
