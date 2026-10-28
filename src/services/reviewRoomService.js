import { supabase, SUPABASE_URL } from './supabaseClient';
import * as FileSystem from 'expo-file-system/legacy';
const endpoint = 'https://art-link.kr/api/review-room';
export async function reviewAction(accountId, action, payload = {}, signal) {
  const {
    data
  } = await supabase.auth.getSession();
  const session = data?.session;
  if (!accountId || session?.user?.id !== accountId || session.user.is_anonymous) throw Error('LOGIN_REQUIRED');
  const controller = new AbortController(),
    cancel = () => controller.abort();
  if (signal?.aborted) cancel();else signal?.addEventListener('abort', cancel);
  const timer = setTimeout(cancel, 25000);
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + session.access_token
      },
      body: JSON.stringify({
        ...payload,
        action
      }),
      signal: controller.signal
    });
    const result = await response.json();
    const fresh = await supabase.auth.getSession();
    if (fresh.data?.session?.user?.id !== accountId) throw Error('ACCOUNT_CHANGED');
    if (!response.ok) throw Error(result.error || 'UNAVAILABLE');
    return result;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', cancel);
  }
}
export async function uploadReviewFile(accountId, file, reservation, signal) {
  const {
    data
  } = await supabase.auth.getSession();
  if (data?.session?.user?.id !== accountId) throw Error('ACCOUNT_CHANGED');
  if (!reservation.uploadUrl.startsWith(SUPABASE_URL + '/storage/v1/object/upload/sign/review-media/')) throw Error('INVALID_UPLOAD_URL');
  const task = FileSystem.createUploadTask(reservation.uploadUrl, file.uri, {
    httpMethod: 'PUT',
    uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
    headers: {
      'Content-Type': file.mimeType
    }
  });
  const cancel = () => task.cancelAsync();
  if (signal?.aborted) throw Error('CANCELLED');
  signal?.addEventListener('abort', cancel);
  const timer = setTimeout(cancel, 120000);
  try {
    const result = await task.uploadAsync();
    if (!result || result.status < 200 || result.status >= 300) {
      // A lost response may mean the immutable object already exists. Finalize
      // checks the actual stored size/type and is safe to retry.
      if (result?.status !== 409 && !(result?.status === 400 && /already exists|duplicate/i.test(result.body || ''))) throw Error('UPLOAD_INCOMPLETE');
    }
    const fresh = await supabase.auth.getSession();
    if (fresh.data?.session?.user?.id !== accountId) throw Error('ACCOUNT_CHANGED');
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', cancel);
  }
}
export function reviewError(error, ko = true) {
  const map = {
    LOGIN_REQUIRED: ['로그인 후 작품을 공유할 수 있어요.', 'Sign in to share your work.'],
    ACCOUNT_CHANGED: ['계정이 바뀌어 작업을 중단했어요.', 'Your account changed. Please try again.'],
    ACCESS_DENIED: ['접근 권한이 없거나 초대가 종료됐어요.', 'Access is unavailable or the invitation ended.'],
    NOT_FOUND: ['작품을 찾을 수 없어요.', 'This work is unavailable.'],
    INVALID_MEDIA: ['JPG·PNG·WebP, MP3·M4A·WAV, MP4·MOV·WebM 중 25MB 이하 파일을 선택해주세요.', 'Choose a supported image, audio or video file up to 25 MB.'],
    INVALID_ANCHOR: ['코멘트 위치나 시간 범위를 확인해주세요.', 'Check the comment position or time range.'],
    INVALID_BRIEF: ['피드백 질문은 400자, 작품 설명·수정 기록은 600자 이내로 적어주세요.', 'Keep the feedback question within 400 characters and the context or revision note within 600.'],
    STORAGE_LIMIT: ['작품 저장 한도 250MB에 도달했어요.', 'Your 250 MB review storage is full.'],
    ASSIGNMENT_CLOSED_OR_FIELD: ['과제가 마감됐거나 분야가 달라요.', 'The assignment is closed or the field does not match.'],
    UPLOAD_INCOMPLETE: ['업로드가 완료되지 않았어요. 선택한 파일을 유지하고 다시 시도해주세요.', 'The upload is incomplete. Retry with the same file.'],
    UNAVAILABLE: ['작품 피드백룸에 연결하지 못했어요. 잠시 후 다시 시도해주세요.', 'Review rooms are unavailable. Please try again.']
  };
  return (map[error?.message] || ['처리하지 못했어요. 입력 내용은 남아 있어요. 다시 시도해주세요.', 'Unable to finish. Your draft is still here. Please retry.'])[ko ? 0 : 1];
}
