import React,{useEffect,useRef,useState} from 'react';
import {View,Text,TextInput,TouchableOpacity,ScrollView,StyleSheet} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useApp} from '../context/AppContext';
import {getStorageScope} from '../utils/accountStorage';
import {code,describe} from '../utils/studioTransferContract';
import {readStudioTransfer} from '../services/studioImportService';

export default function StudioImportScreen({route,navigation}) {
 const {handleSaveNote,userProfile,isKoreanLocale}=useApp(),ko=isKoreanLocale!==false;
 const say=(a,b)=>ko?a:b;
 const [input,setInput]=useState(code(route?.params?.code)||''),[note,setNote]=useState(null),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const generation=useRef(0),lock=useRef(false),controller=useRef(null),mounted=useRef(true),owner=useRef(null);
 owner.current={scope:getStorageScope(),account:userProfile?.authUserId||null};
 const capture=()=>({...owner.current,generation:generation.current});
 const current=v=>mounted.current&&v.generation===generation.current&&v.scope===getStorageScope()&&v.account===owner.current.account;
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;generation.current++;controller.current?.abort();};},[]);
 useEffect(()=>{generation.current++;controller.current?.abort();lock.current=false;setNote(null);setBusy(false);setMessage('');},[userProfile?.authUserId]);
 const load=async value=>{
  if(lock.current)return;
  if(!code(value)){setMessage(say('웹 작업실에서 받은 24자리 코드를 입력해주세요.','Enter the 24-character code from the web studio.'));return;}
  lock.current=true;setBusy(true);setNote(null);setMessage('');const ticket=capture();controller.current=new AbortController();
  try{const result=await readStudioTransfer(value,{signal:controller.current.signal});if(current(ticket))setNote(result);}
  catch(e){if(current(ticket))setMessage(['NOT_FOUND','EXPIRED'].includes(e.message)?say('만료되었거나 취소된 코드예요. 웹 작업실에서 다시 만들어주세요.','This code has expired or was revoked. Create a new one in the studio.'):e.message==='TRY_AGAIN'?say('잠시 후 다시 눌러주세요.','Please try again shortly.'):say('가져오지 못했어요. 연결을 확인하고 다시 시도해주세요.','Could not import. Check your connection and retry.'));}
  finally{if(current(ticket)){lock.current=false;setBusy(false);}}
 };
 useEffect(()=>{const c=code(route?.params?.code);if(c){setInput(c);load(c);}},[route?.params?.code]);
 const save=async()=>{
  if(lock.current||!note)return;lock.current=true;setBusy(true);setMessage('');const ticket=capture();
  try{const id=await handleSaveNote(note);if(current(ticket))navigation.replace('NoteDetail',{noteId:id});}
  catch(e){if(current(ticket))setMessage(e.message==='REVIEW_DELETED'?say('전에 삭제한 기록입니다. 다시 가져오려면 웹에서 새 코드를 만들어주세요.','This review was previously deleted. Create a new transfer code to import it again.'):say('저장하지 못했어요. 가져온 내용은 남아 있으니 다시 저장해주세요.','Could not save. Your preview is still here; please retry.'));}
  finally{if(current(ticket)){lock.current=false;setBusy(false);}}
 };
 return <SafeAreaView style={s.page}><ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
  <TouchableOpacity accessibilityRole="button" onPress={()=>navigation.goBack()}><Text style={s.link}>{say('← 내 기록','← My notes')}</Text></TouchableOpacity>
  <Text style={s.title}>{say('웹 작업 이어받기','Continue your web review')}</Text>
  <Text style={s.body}>{say('웹 작업실의 메모와 비교 설정을 확인하고 내 기록으로 저장하세요. 사진·영상·음원 원본은 옮겨지지 않습니다.','Preview your notes and comparison settings, then save to My notes. Original images, video and audio are not transferred.')}</Text>
  <TextInput testID="studio-code" style={s.input} accessibilityLabel={say('전송 코드','Transfer code')} placeholder="xxxx-xxxx-xxxx-xxxx-xxxx-xxxx" autoCapitalize="none" autoCorrect={false} maxLength={40} value={input} editable={!busy} onChangeText={v=>{setInput(v);setNote(null);setMessage('');}} />
  <TouchableOpacity testID="studio-load" accessibilityRole="button" disabled={busy} style={[s.button,busy&&s.dim]} onPress={()=>load(input)}><Text style={s.white}>{say('기록 확인','Preview review')}</Text></TouchableOpacity>
  {!!message&&<Text accessibilityRole="alert" style={s.error}>{message}</Text>}
  {busy&&<Text style={s.body}>{say('처리 중…','Working…')}</Text>}
  {note&&<View style={s.preview}><Text style={s.body}>{describe(note.webReview.review)}</Text>
   <Text style={s.small}>{userProfile?.authUserId?say('현재 로그인한 계정의 비공개 기록으로 저장합니다.','Save to the private notes of your signed-in account.'):say('이 기기의 내 기록에 저장합니다. 로그인하면 계정에 동기화할 수 있어요.','Save to notes on this device. Sign in to sync with your account.')}</Text>
   <TouchableOpacity testID="studio-save" accessibilityRole="button" disabled={busy} style={[s.button,busy&&s.dim]} onPress={save}><Text style={s.white}>{say('내 기록에 저장','Save to My notes')}</Text></TouchableOpacity>
  </View>}
  <Text style={s.small}>{say('AI를 호출하거나 이용 횟수를 차감하지 않습니다. 같은 코드는 기존 기록을 열며 수정한 내용을 덮어쓰지 않습니다.','This does not call AI or use your allowance. Reusing a code opens the existing note without overwriting your edits.')}</Text>
 </ScrollView></SafeAreaView>;
}
const s=StyleSheet.create({page:{flex:1,backgroundColor:'#F5F3ED'},content:{padding:24,gap:18},title:{fontSize:28,fontWeight:'700',color:'#252821'},body:{fontSize:15,lineHeight:24,color:'#252821'},small:{fontSize:12,lineHeight:19,color:'#666B61'},input:{backgroundColor:'#FFF',borderWidth:1,borderColor:'#DCDED4',borderRadius:12,padding:14,minHeight:48,color:'#252821'},button:{backgroundColor:'#252821',borderRadius:12,padding:15,minHeight:48,alignItems:'center'},white:{color:'#FFF',fontWeight:'700'},link:{color:'#AA3E32',paddingVertical:10},preview:{backgroundColor:'#FFFEFA',borderRadius:16,padding:18,gap:20},error:{color:'#AA3E32',lineHeight:22},dim:{opacity:.5}});
