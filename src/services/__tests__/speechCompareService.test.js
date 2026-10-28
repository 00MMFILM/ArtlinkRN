import { compareSpeech, getSpeechDrills } from '../speechCompareService';
import { supabase } from '../supabaseClient';
import * as FileSystem from 'expo-file-system/legacy';
jest.mock('../supabaseClient', () => ({ supabase: { auth: { getSession: jest.fn() } } }));
let mockScope = 'account:a';
jest.mock('../../utils/accountStorage', () => ({ getStorageScope: () => mockScope }));
jest.mock('expo-file-system/legacy', () => ({ EncodingType: { Base64: 'base64' }, getInfoAsync: jest.fn(), readAsStringAsync: jest.fn() }));
const drill = { id: 'closing', sha256: 'a'.repeat(64), text: '오늘은 여기까지 이야기할게요.', kind: 'ai-generated', url: '/speech-coach/v1/closing.mp3' };
const args = { accountId: 'a', uri: 'file:///take.m4a', reference: drill.text, drill, requestId: 'id' };
const segment = { start: 0.1, end: 0.8, change: 3, curve: Array(12).fill(0) };
const result = () => ({ version: 1, targetKind: 'ai-generated', targetHash: drill.sha256, reference: drill.text, status: 'compared',
  segments: [{ index: 0, word: '오늘은', target: segment, attempt: segment, pitchDelta: 0, durationRatio: 1 }], suggestions: [], coverage: { compared: 1, total: 3 } });
beforeEach(() => {
  jest.clearAllMocks(); mockScope = 'account:a';
  supabase.auth.getSession.mockResolvedValue({ data: { session: { user: { id: 'a' }, access_token: 'test-token' } } });
  FileSystem.getInfoAsync.mockResolvedValue({ exists: true, size: 100 }); FileSystem.readAsStringAsync.mockResolvedValue('YXVkaW8=');
  global.fetch = jest.fn(async () => ({ ok: true, json: async () => result() }));
});
test('catalog allows only versioned first-party AI references, never arbitrary audio URLs', async () => {
  fetch.mockResolvedValue({ ok: true, json: async () => ({ version: 1, available: true, drills: [drill, null, { ...drill, url: 'https://bad.test/a.mp3' }, { ...drill, id: '../x' }] }) });
  const data = await getSpeechDrills(); expect(data.drills).toHaveLength(1); expect(data.drills[0].uri).toBe('https://art-link.kr/speech-coach/v1/closing.mp3');
});
test('built-in request sends only the local take and selected reference hash, authenticated', async () => {
  expect(await compareSpeech(args)).toEqual(result());
  const [, req] = fetch.mock.calls[0]; const body = JSON.parse(req.body);
  expect(req.headers.Authorization).toBe('Bearer test-token');
  expect(body).toMatchObject({ drillId: 'closing', targetHash: drill.sha256, consent: true }); expect(body.targetAudio).toBeUndefined();
  expect(FileSystem.readAsStringAsync).toHaveBeenCalledTimes(1);
});
test('custom reference requires a different local file and uploads both audio files', async () => {
  fetch.mockResolvedValue({ ok: true, json: async () => ({ ...result(), targetKind: 'user-selected' }) });
  await compareSpeech({ ...args, drill: undefined, targetUri: 'file:///teacher.m4a' });
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toMatchObject({ targetAudio: 'YXVkaW8=', targetConsent: true });
  await expect(compareSpeech({ ...args, drill: undefined, targetUri: args.uri })).rejects.toThrow('SAME_RECORDING');
});
test('no signed-in account, remote URI, and oversized audio cannot reach the API', async () => {
  await expect(compareSpeech({ ...args, accountId: null })).rejects.toThrow('LOGIN_REQUIRED');
  await expect(compareSpeech({ ...args, uri: 'https://other.test/secret' })).rejects.toThrow('INVALID_AUDIO');
  FileSystem.getInfoAsync.mockResolvedValue({ exists: true, size: 1400001 });
  await expect(compareSpeech(args)).rejects.toThrow('INVALID_AUDIO'); expect(fetch).not.toHaveBeenCalled();
});
test('account switch during file reading prevents upload', async () => {
  FileSystem.readAsStringAsync.mockImplementation(async () => { mockScope = 'account:b'; return 'YXVkaW8='; });
  await expect(compareSpeech(args)).rejects.toThrow('LOGIN_REQUIRED'); expect(fetch).not.toHaveBeenCalled();
});
test('aborted and late responses after account switch are discarded', async () => {
  const controller = new AbortController(); controller.abort();
  await expect(compareSpeech({ ...args, signal: controller.signal })).rejects.toThrow('CANCELLED');
  fetch.mockImplementation(async () => { mockScope = 'account:b'; return { ok: true, json: async () => result() }; });
  await expect(compareSpeech(args)).rejects.toThrow('LOGIN_REQUIRED');
});
test.each([
  r => ({ ...r, targetHash: 'b'.repeat(64) }), r => ({ ...r, reference: '다른 대사입니다.' }),
  r => ({ ...r, segments: [{ ...r.segments[0], attempt: { ...segment, end: 31 } }] }),
  r => ({ ...r, segments: [{ ...r.segments[0], target: { ...segment, curve: [NaN] } }] }),
  r => ({ ...r, suggestions: [{ index: 9, focus: 'pitch', direction: 'less_rise' }] }),
  r => ({ ...r, status: 'text_uncertain' }), r => ({ ...r, coverage: { compared: 99, total: 3 } })
])('rejects a result that is unrelated or unsafe to display/play: %p', async mutate => {
  fetch.mockResolvedValue({ ok: true, json: async () => mutate(result()) });
  await expect(compareSpeech(args)).rejects.toThrow('UNAVAILABLE');
});
test('uncertain recognition is retained as uncertainty without generated feedback', async () => {
  const uncertain = { ...result(), status: 'text_uncertain', segments: [], suggestions: [] };
  fetch.mockResolvedValue({ ok: true, json: async () => uncertain }); expect(await compareSpeech(args)).toEqual(uncertain);
});
