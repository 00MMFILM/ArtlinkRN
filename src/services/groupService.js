import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from './supabaseClient';

// Bind each request to the account that initiated it. Never use a device ID as
// group identity or cache private messages across accounts.
export async function groupAction(accountId, action, groupId = null, payload = {}) {
  const { data } = await supabase.auth.getSession();
  const session = data?.session;
  if (!accountId || session?.user?.id !== accountId || session.user.is_anonymous || !session.access_token) throw new Error('GROUP_LOGIN_REQUIRED');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/artlink_group_action`, {
      method: 'POST', signal: controller.signal,
      headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ p_action: action, p_group_id: groupId, p_payload: payload }),
    });
    const result = await response.json();
    const current = await supabase.auth.getSession();
    if (current.data?.session?.user?.id !== accountId) throw new Error('GROUP_ACCOUNT_CHANGED');
    if (!response.ok) {
      if (result?.code === 'PGRST202' || result?.code === '42883') throw new Error('GROUP_UNAVAILABLE');
      const code = /^GROUP_[A-Z_]+$/.test(result?.message || '') ? result.message : response.status === 401 ? 'GROUP_LOGIN_REQUIRED' : 'GROUP_REQUEST_FAILED';
      throw new Error(code);
    }
    return result;
  } finally { clearTimeout(timer); }
}

export function groupErrorMessage(error, ko) {
  const messages = {
    GROUP_LOGIN_REQUIRED: ['로그인 후 이용할 수 있어요.', 'Sign in to use private groups.'],
    GROUP_ACCOUNT_CHANGED: ['계정이 변경되어 요청을 중단했어요.', 'Your account changed. Please try again.'],
    GROUP_UNAVAILABLE: ['단체 공간 연결을 준비하고 있어요. 연결이 완료되면 이용할 수 있습니다.', 'Private groups are not connected yet. Please check back after setup.'],
    GROUP_ACCESS_DENIED: ['이 공간에 접근할 수 없어요. 운영자에게 가입 상태를 확인해주세요.', 'You no longer have access. Contact the group owner.'],
    GROUP_OWNER_REQUIRED: ['운영자만 할 수 있는 작업이에요.', 'Only the group owner can do this.'],
    GROUP_INVITE_INVALID: ['초대코드가 올바르지 않거나 만료됐어요.', 'This invitation is invalid or expired.'],
    GROUP_LIMIT: ['만들 수 있는 단체 공간은 최대 3개예요.', 'You can own up to three groups.'],
    GROUP_RATE_LIMIT: ['메시지를 잠시 후 다시 보내주세요.', 'Please wait a moment before sending again.'],
    GROUP_OWNER_CANNOT_LEAVE: ['운영자는 현재 이 공간을 나갈 수 없어요.', 'The owner cannot leave this group.'],
    GROUP_INVALID_INPUT: ['이름·제목·내용을 확인해주세요.', 'Please check the name, title and message.'],
  };
  return (messages[error?.message] || ['연결하지 못했어요. 입력 내용은 남아 있으니 다시 시도해주세요.', 'Could not connect. Your draft is preserved; please try again.'])[ko ? 0 : 1];
}
