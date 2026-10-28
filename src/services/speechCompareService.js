import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from './supabaseClient';
import { getStorageScope } from '../utils/accountStorage';
const endpoint = 'https://art-link.kr/api/speech-compare';
const MAX_BYTES = 1400000;
export async function getSpeechDrills(signal) {
  const response = await fetch(endpoint, { signal });
  const body = await response.json();
  if (!response.ok || body.version !== 1 || !Array.isArray(body.drills)) throw Error('UNAVAILABLE');
  const drills = body.drills.filter(d => d && /^[a-z-]{1,30}$/.test(d.id) && d.kind === 'ai-generated' && typeof d.text === 'string'
    && /^[a-f0-9]{64}$/.test(d.sha256) && d.url === `/speech-coach/v1/${d.id}.mp3`);
  return { available: body.available === true, drills: drills.map(d => ({ ...d, uri: `https://art-link.kr${d.url}` })) };
}
export async function compareSpeech({ accountId, uri, reference, targetUri, drill, requestId, signal }) {
  const scope = getStorageScope();
  const current = async () => {
    const { data } = await supabase.auth.getSession();
    if (signal?.aborted) throw Error('CANCELLED');
    const session = data?.session;
    if (!accountId || session?.user?.id !== accountId || session.user.is_anonymous || scope !== getStorageScope()) throw Error('LOGIN_REQUIRED');
    return session;
  };
  const localAudio = async value => {
    if (typeof value !== 'string' || !value.startsWith('file://')) throw Error('INVALID_AUDIO');
    const info = await FileSystem.getInfoAsync(value);
    if (!info.exists || !Number.isFinite(info.size) || info.size < 44 || info.size > MAX_BYTES) throw Error('INVALID_AUDIO');
    const encoded = await FileSystem.readAsStringAsync(value, { encoding: FileSystem.EncodingType.Base64 });
    if (encoded.length > Math.ceil(MAX_BYTES / 3) * 4) throw Error('INVALID_AUDIO');
    return encoded;
  };
  await current();
  if (uri === targetUri) throw Error('SAME_RECORDING');
  const audio = await localAudio(uri);
  const target = drill ? { drillId: drill.id, targetHash: drill.sha256 } : { targetAudio: await localAudio(targetUri), targetConsent: true };
  const session = await current();
  const response = await fetch(endpoint, { method: 'POST', signal, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({ audio, reference: reference.trim(), ...target, requestId, consent: true }) });
  const result = await response.json(); await current();
  if (!response.ok) throw Error(result.error || 'UNAVAILABLE');
  if (result.version !== 1 || result.reference !== reference.trim() || !/^[a-f0-9]{64}$/.test(result.targetHash || '')
    || result.targetKind !== (drill ? 'ai-generated' : 'user-selected')
    || (drill && result.targetHash !== drill.sha256) || !['compared', 'text_uncertain', 'pitch_uncertain'].includes(result.status)
    || !Array.isArray(result.segments) || !Array.isArray(result.suggestions) || result.segments.length > 100 || result.suggestions.length > 3) throw Error('UNAVAILABLE');
  const interval = s => s && Number.isFinite(s.start) && Number.isFinite(s.end) && s.start >= 0 && s.end > s.start && s.end <= 30.05
    && Number.isFinite(s.change) && Array.isArray(s.curve) && s.curve.length === 12 && s.curve.every(n => n === null || (Number.isFinite(n) && Math.abs(n) < 60));
  if (result.segments.some(s => !s || !Number.isInteger(s.index) || s.index < 0 || typeof s.word !== 'string' || !s.word || !interval(s.target) || !interval(s.attempt)
    || !Number.isFinite(s.pitchDelta) || !Number.isFinite(s.durationRatio) || s.durationRatio <= 0)) throw Error('UNAVAILABLE');
  if (result.suggestions.some(s => !s || !result.segments.some(p => p.index === s.index) || !['pitch', 'timing'].includes(s.focus)
    || !['less_rise', 'more_rise', 'shorter', 'longer'].includes(s.direction))) throw Error('UNAVAILABLE');
  if (result.status === 'compared') {
    if (!result.segments.length || result.coverage?.compared !== result.segments.length || !Number.isInteger(result.coverage.total)
      || result.coverage.total < result.segments.length || result.coverage.total > 100
      || new Set(result.segments.map(s => s.index)).size !== result.segments.length) throw Error('UNAVAILABLE');
  } else if (result.segments.length || result.suggestions.length) throw Error('UNAVAILABLE');
  return result;
}
