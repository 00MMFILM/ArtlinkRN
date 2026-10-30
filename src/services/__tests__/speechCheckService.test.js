import { checkSpeech } from '../speechCheckService';
import { supabase } from '../supabaseClient';
import * as FileSystem from 'expo-file-system/legacy';
jest.mock('../supabaseClient',()=>({supabase:{auth:{getSession:jest.fn()}}}));
jest.mock('../../utils/accountStorage',()=>({getStorageScope:()=> 'account:a'}));
jest.mock('expo-file-system/legacy',()=>({EncodingType:{Base64:'base64'},getInfoAsync:jest.fn(),readAsStringAsync:jest.fn()}));
const args={accountId:'a',uri:'file:///take.m4a',reference:'Hello.',locale:'en-US',requestId:'id'};
const data={version:1,locale:'en-US',reference:'Hello.',signal:{duration:1,quiet:[],warnings:[]},pronunciation:{status:'unavailable',words:[]}};
beforeEach(()=>{
 jest.clearAllMocks();supabase.auth.getSession.mockResolvedValue({data:{session:{user:{id:'a'},access_token:'test-token'}}});
 FileSystem.getInfoAsync.mockResolvedValue({exists:true,size:100});FileSystem.readAsStringAsync.mockResolvedValue('YXVkaW8=');
 global.fetch=jest.fn(async()=>({ok:true,json:async()=>data}));
});
test('sends authenticated base64 audio only for a local file',async()=>{
 expect(await checkSpeech(args)).toEqual(data);expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/speech-check'),expect.objectContaining({headers:expect.objectContaining({Authorization:'Bearer test-token'})}));
 await expect(checkSpeech({...args,uri:'https://untrusted.test/'})).rejects.toThrow('INVALID_AUDIO');expect(fetch).toHaveBeenCalledTimes(1);
});
test('prevents oversized file uploads',async()=>{
 FileSystem.getInfoAsync.mockResolvedValue({exists:true,size:2097153});await expect(checkSpeech(args)).rejects.toThrow('INVALID_AUDIO');expect(fetch).not.toHaveBeenCalled();
});
test('rejects late results after account change',async()=>{
 global.fetch=jest.fn(async()=>{supabase.auth.getSession.mockResolvedValue({data:{session:{user:{id:'b'},access_token:'b'}}});return {ok:true,json:async()=>data};});
 await expect(checkSpeech(args)).rejects.toThrow('LOGIN_REQUIRED');
});
test('does not treat a mismatched reference or language as a result for this recording',async()=>{
 global.fetch=jest.fn(async()=>({ok:true,json:async()=>({...data,reference:'Another line'})}));
 await expect(checkSpeech(args)).rejects.toThrow('UNAVAILABLE');
});
