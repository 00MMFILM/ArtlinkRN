import { normalizePracticeSceneId } from './deeplinkSource';
export const STANDARD_SPEECH = 'standard_speech';
export function practicePrefill(query = {}) {
  const prefill = {
    title: typeof query.title === 'string' ? query.title.slice(0, 120) : '',
    content: typeof query.content === 'string' ? query.content.slice(0, 2000) : '',
    field: typeof query.field === 'string' ? query.field : 'acting',
  };
  if (prefill.field === 'art') prefill.intent = 'material';
  if (prefill.field === 'acting' && query.mode === 'quick_scene' && ['ko', 'en'].includes(query.language)) {
    prefill.quickStart = true;
    prefill.scriptLanguage = query.language;
  }
  const sceneId = normalizePracticeSceneId(query);
  if (sceneId) prefill.sceneId = sceneId;
  if (sceneId && query.source === 'actraw' && query.mode === STANDARD_SPEECH) {
    prefill.practiceMode = STANDARD_SPEECH;
    prefill.field = 'acting';
  }
  return prefill;
}
export function speechLines(content) {
  return typeof content === 'string' ? content.split(/\n+/).map(s => s.trim()).filter(Boolean).slice(0, 100) : [];
}
