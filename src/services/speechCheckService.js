import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from './supabaseClient';
import { getStorageScope } from '../utils/accountStorage';
const endpoint = 'https://art-link.kr/api/speech-check';
export async function checkSpeech({ accountId, uri, reference, locale, requestId, signal }) {
  const scope = getStorageScope();
  const current = async () => {
    const { data } = await supabase.auth.getSession();
    if (signal?.aborted) throw Error('CANCELLED');
    if (!accountId || data?.session?.user?.id !== accountId || data?.session?.user?.is_anonymous || scope !== getStorageScope()) throw Error('LOGIN_REQUIRED');
    return data.session;
  };
  const session = await current();
  if (typeof uri !== 'string' || !uri.startsWith('file://')) throw Error('INVALID_AUDIO');
  const info = await FileSystem.getInfoAsync(uri);
  if (!info.exists || !Number.isFinite(info.size) || info.size > 2 * 1024 * 1024) throw Error('INVALID_AUDIO');
  const audio = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
  await current();
  const response = await fetch(endpoint, { method: 'POST', signal,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({ audio, reference, locale, requestId, consent: true }) });
  const result = await response.json();
  await current();
  if (!response.ok) throw Error(result.error || 'UNAVAILABLE');
  if (result.version !== 1 || result.locale !== locale || result.reference !== reference.trim()
    || !result.signal || !Array.isArray(result.signal.quiet) || !Array.isArray(result.signal.warnings)
    || !Number.isFinite(result.signal.duration) || !result.pronunciation || !Array.isArray(result.pronunciation.words)) throw Error('UNAVAILABLE');
  return result;
}
