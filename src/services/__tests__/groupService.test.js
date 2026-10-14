import { groupAction, assignmentAction } from '../groupService';
import { supabase } from '../supabaseClient';
jest.mock('../supabaseClient',()=>({supabase:{auth:{getSession:jest.fn()}},SUPABASE_URL:'https://test.invalid',SUPABASE_ANON_KEY:'public-test-key'}));
const session=(id)=>({data:{session:{user:{id},access_token:`test-${id}`}}});
beforeEach(()=>{jest.clearAllMocks();supabase.auth.getSession.mockResolvedValue(session('a'));global.fetch=jest.fn(async()=>({ok:true,json:async()=>[]}));});
test('uses the initiating authenticated account, not a device identity',async()=>{
  await groupAction('a','list');
  const [url,opts]=fetch.mock.calls[0];expect(url).toContain('/rpc/artlink_group_action');
  expect(opts.headers.Authorization).toBe('Bearer test-a');expect(JSON.parse(opts.body)).toEqual({p_action:'list',p_group_id:null,p_payload:{}});
});
test('rejects account changes before dispatch and never leaks another account response',async()=>{
  await expect(groupAction('b','list')).rejects.toThrow('GROUP_LOGIN_REQUIRED');expect(fetch).not.toHaveBeenCalled();
  supabase.auth.getSession.mockResolvedValueOnce(session('a')).mockResolvedValueOnce(session('b'));
  await expect(groupAction('a','read','g')).rejects.toThrow('GROUP_ACCOUNT_CHANGED');
});
test('missing migration fails closed without demo membership',async()=>{
  fetch.mockResolvedValue({ok:false,status:404,json:async()=>({code:'PGRST202'})});
  await expect(groupAction('a','list')).rejects.toThrow('GROUP_UNAVAILABLE');
});
test('preserves server authorization errors',async()=>{
  fetch.mockResolvedValue({ok:false,status:403,json:async()=>({message:'GROUP_ACCESS_DENIED'})});
  await expect(groupAction('a','read','other')).rejects.toThrow('GROUP_ACCESS_DENIED');
});

test('assignment actions use the same account-bound request checks',async()=>{
  await assignmentAction('a','read','g',{assignmentId:'lesson'});
  expect(fetch.mock.calls[0][0]).toContain('/rpc/artlink_assignment_action');
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({p_action:'read',p_group_id:'g',p_payload:{assignmentId:'lesson'}});
  supabase.auth.getSession.mockResolvedValueOnce(session('a')).mockResolvedValueOnce(session('b'));
  await expect(assignmentAction('a','read','g')).rejects.toThrow('GROUP_ACCOUNT_CHANGED');
});
