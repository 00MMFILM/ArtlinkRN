import { feedbackHighlights, nextFeedbackFocus } from '../feedbackHighlights';
import { quickPracticeScene } from '../quickPractice';
test('extracts labelled evidence without absorbing unrelated prose or inventing legacy praise', () => {
 expect(feedbackHighlights('📌 **잘된 점:** 의도가 드러남\n근거: "가지 마"라는 실제 문장\n다음 연습: 마지막 대사만 두 가지로 말하기\n전체 설명은 여기에')).toEqual({strength:'의도가 드러남',evidence:'"가지 마"라는 실제 문장',exercise:'마지막 대사만 두 가지로 말하기'});
 expect(feedbackHighlights('## What worked\nClear intention\n## Evidence\n"Stay"\n## Next exercise\nTry another intention')).toEqual({strength:'Clear intention',evidence:'"Stay"',exercise:'Try another intention'});
 expect(feedbackHighlights('점수 80점, 다음에 잘해봅시다')).toEqual({});
 expect(feedbackHighlights(null)).toEqual({});
 expect(feedbackHighlights('잘된 점:\n## 자세한 분석\n추측')).toEqual({});
});
test('preserves a saved legacy focus and never chooses invalid options', () => {
 expect(nextFeedbackFocus([null,'',7,'문장 끝'],null)).toBe('문장 끝');
 expect(nextFeedbackFocus(['새 후보'],'이전 선택')).toBe('이전 선택');
 expect(nextFeedbackFocus(null,null)).toBeNull();
});
test('quick scenes are original balanced dialogues in the requested language', () => {
 for (const lang of ['ko','en']) {
  const scene=quickPracticeScene(lang);
  expect(scene.language).toBe(lang); expect(scene.lines).toHaveLength(6);
  expect(scene.lines.filter(l=>l.r===0)).toHaveLength(3);
  expect(scene.rights.type).toBe('artlink-original');
  expect(scene.lines.every(l=>scene.roles[l.r] && l.t.trim())).toBe(true);
 }
});
