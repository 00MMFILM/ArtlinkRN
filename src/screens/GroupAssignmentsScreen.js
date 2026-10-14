import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, ScrollView, TouchableOpacity, ActivityIndicator, Alert, AppState, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { usePreventRemove } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { useApp } from '../context/AppContext';
import { assignmentAction, groupErrorMessage } from '../services/groupService';
import { submissionPreview } from '../services/assignmentSubmission';
import { newUuid } from '../services/practiceService';
import { STUDIO as C } from '../constants/studioTheme';

export default function GroupAssignmentsScreen({ route, navigation }) {
  const context = useApp();
  const { i18n } = useTranslation();
  const accountId = context.userProfile?.authUserId;
  return <Workspace key={`${accountId || 'guest'}:${route.params?.groupId}`} context={context} accountId={accountId} groupId={route.params?.groupId} groupName={route.params?.groupName} navigation={navigation} ko={String(i18n.language).startsWith('ko')} />;
}

function Workspace({ context, accountId, groupId, groupName, navigation, ko }) {
  const say = (a,b) => ko ? a : b;
  const [selected, setSelected] = useState(null), [data, setData] = useState(null);
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [loading, setLoading] = useState(true);
  const [title, setTitle] = useState(''), [instructions, setInstructions] = useState(''), [dueDate, setDueDate] = useState('');
  const [noteId, setNoteId] = useState(null), [reflection, setReflection] = useState(''), [consent, setConsent] = useState(false);
  const [reviewId, setReviewId] = useState(null), [comment, setComment] = useState(''), [message, setMessage] = useState('');
  const [visible, setVisible] = useState(AppState.currentState === 'active');
  const generation = useRef(0), alive = useRef(true), foreground = useRef(AppState.currentState === 'active'), focused = useRef(true), lock = useRef(false), pending = useRef({});
  const draft = !!(title.trim() || instructions.trim() || dueDate.trim() || reflection.trim() || comment.trim() || noteId);
  usePreventRemove(draft, ({data: event}) => Alert.alert(say('작성 중인 내용이 있어요','You have an unsent draft'),say('나가면 작성 중인 내용은 사라집니다.','Leaving discards your unsent draft.'),[
    {text:say('계속 작성','Keep writing'),style:'cancel'}, {text:say('나가기','Leave'),style:'destructive',onPress:()=>navigation.dispatch(event.action)},
  ]));
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;generation.current++;};},[]);
  const load = useCallback(async () => {
    if (!accountId || !groupId || !foreground.current || !focused.current) { setLoading(false); return; }
    const epoch=++generation.current;
    try {
      const [list,detail] = await Promise.all([
        assignmentAction(accountId,'list',groupId),
        selected ? assignmentAction(accountId,'read',groupId,{assignmentId:selected}) : Promise.resolve(null),
      ]);
      if (!alive.current || epoch!==generation.current || !foreground.current || !focused.current) return;
      setData({list,detail}); setError('');
    } catch(e) {
      if (!alive.current || epoch!==generation.current) return;
      setError(groupErrorMessage(e,ko));
      if (['GROUP_ACCESS_DENIED','GROUP_LOGIN_REQUIRED','GROUP_ACCOUNT_CHANGED'].includes(e.message)) setData(null);
    } finally { if (alive.current && epoch===generation.current) setLoading(false); }
  },[accountId,groupId,selected,ko]);
  useEffect(()=>{
    setData(null);setLoading(true);load();
    const hide=()=>{generation.current++;setVisible(false);setData(null);setConsent(false);};
    const app=AppState.addEventListener('change',state=>{foreground.current=state==='active';if(!foreground.current)hide();else if(focused.current){setVisible(true);load();}});
    const blur=navigation.addListener?.('blur',()=>{focused.current=false;hide();});
    const focus=navigation.addListener?.('focus',()=>{focused.current=true;if(foreground.current){setVisible(true);load();}});
    return()=>{generation.current++;app.remove();blur?.();focus?.();};
  },[load,navigation]);
  const clearDraft=()=>{setTitle('');setInstructions('');setDueDate('');setNoteId(null);setReflection('');setConsent(false);setReviewId(null);setComment('');pending.current={};};
  const choose=id=>{
    const change=()=>{clearDraft();setSelected(id);setMessage('');};
    if(draft)Alert.alert(say('작성 중인 내용이 있어요','Unsent draft'),say('과제를 바꾸면 작성 중인 내용이 사라집니다.','Switching assignments discards this draft.'),[{text:say('취소','Cancel'),style:'cancel'},{text:say('이동','Continue'),onPress:change}]);
    else change();
  };
  const run=async(action,payload={},onSuccess)=>{
    if(lock.current)return;
    lock.current=true;setBusy(true);setError('');setMessage('');
    const epoch=generation.current;
    const current=()=>alive.current&&epoch===generation.current&&foreground.current&&focused.current;
    try {
      const result=await assignmentAction(accountId,action,groupId,{...payload,...(selected?{assignmentId:selected}:{})});
      if(!current())return;
      onSuccess?.(result);
      setMessage(say('저장했습니다.','Saved.'));
      if(action!=='create')await load();
    }catch(e){if(current()){setError(groupErrorMessage(e,ko));if(['GROUP_ACCESS_DENIED','GROUP_LOGIN_REQUIRED','GROUP_ACCOUNT_CHANGED'].includes(e.message))setData(null);}}
    finally{lock.current=false;if(alive.current)setBusy(false);}
  };
  const withKey=(kind,payload)=>{
    const fingerprint=JSON.stringify(payload);
    if(pending.current[kind]?.fingerprint!==fingerprint)pending.current[kind]={fingerprint,id:newUuid()};
    return {...payload,clientId:pending.current[kind].id};
  };
  const button=(id,label,onPress,disabled=false,primary=false)=><TouchableOpacity key={id} testID={id} accessibilityRole="button" accessibilityState={{disabled:disabled||busy}} disabled={disabled||busy} onPress={onPress} style={[s.button,primary&&s.primary,(disabled||busy)&&s.disabled]}><Text style={[s.buttonText,primary&&s.white]}>{label}</Text></TouchableOpacity>;
  const input=(id,value,set,placeholder,maxLength,multiline=false)=><TextInput testID={id} accessibilityLabel={placeholder} placeholder={placeholder} placeholderTextColor={C.muted} value={value} onChangeText={set} maxLength={maxLength} multiline={multiline} editable={!busy} style={[s.input,multiline&&s.multiline]}/>;
  const owner=data?.list.role==='owner';
  const assignment=data?.detail?.assignment;
  const notes=(context.savedNotes||[]).filter(n=>submissionPreview(n)).sort((a,b)=>new Date(b.createdAt||0)-new Date(a.createdAt||0)).slice(0,30);
  const note=notes.find(n=>String(n.id)===noteId);
  const preview=submissionPreview(note);
  useEffect(()=>{setConsent(false);},[preview?.noteKey,preview?.practiceText,preview?.aiFeedback,preview?.noteTitle]);
  const submissions=data?.detail?.submissions||[];
  const metrics=data?.list.metrics;
  return <SafeAreaView style={s.safe} edges={['top','bottom']}>
    <View style={s.top}>{button('assignment-back',say('뒤로','Back'),()=>selected?choose(null):navigation.goBack())}<Text style={s.heading}>{say('과제와 피드백','Assignments & feedback')}</Text></View>
    <KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==='ios'?'padding':undefined}><ScrollView contentContainerStyle={s.page} keyboardShouldPersistTaps="handled">
      <Text style={s.eyebrow}>{groupName || say('학원·극단 공간','Private group')}</Text>
      <Text style={s.title}>{assignment?.title || say('다음 연습을 함께.','Keep practising together.')}</Text>
      {!!error&&<Text accessibilityRole="alert" style={s.error}>{error}</Text>}
      {!!message&&visible&&<Text accessibilityRole="alert" style={s.success}>{message}</Text>}
      {!accountId ? <Text style={s.body}>{say('로그인 후 이용할 수 있어요.','Sign in to view assignments.')}</Text> : !visible ? null : <>
      {button('assignment-refresh',say('새로고침','Refresh'),load)}
      {loading&&<ActivityIndicator/>}
      {!selected&&data&&<>
        <Text style={s.body}>{say('과제를 확인하고 연습 기록을 제출하세요. 제출물은 본인과 운영자만 볼 수 있어요.','Read an assignment and share your practice. Only you and the group owner can see your submissions.')}</Text>
        {owner&&metrics&&<View style={s.metrics} testID="assignment-metrics">
          <Text style={s.heading}>{say('우리 공간 참여 현황','Group participation')}</Text>
          <Text style={s.body}>{say(`현재 학생 ${metrics.members}명 · 누적 제출자 ${metrics.submitters}명`,`Current students ${metrics.members} · All-time submitters ${metrics.submitters}`)}</Text>
          <Text style={s.body}>{say(`제출 ${metrics.submissions}건 · 코멘트 ${metrics.reviewed}건`,`Submissions ${metrics.submissions} · Reviewed ${metrics.reviewed}`)}</Text>
          <Text style={s.body}>{say(`재제출 ${metrics.repeaters}명 · 첫 제출 후 7일 내 ${metrics.repeatersWithin7Days}명`,`Repeat submitters ${metrics.repeaters} · Within 7 days of first submission ${metrics.repeatersWithin7Days}`)}</Text>
          <Text style={s.small}>{say(`AI 피드백을 함께 제출한 기록 ${metrics.feedbackShared}건. 누적 집계이며 AI의 정확도나 결제 실적을 뜻하지 않습니다.`,`Notes shared with AI feedback: ${metrics.feedbackShared}. These are cumulative submission counts, not AI accuracy or verified payments.`)}</Text>
        </View>}
        {data.list.assignments.map(a=>button(`assignment-open-${a.id}`,`${a.closed_at?say('마감 · ','Closed · '):''}${a.title}${a.due_date?` · ${a.due_date}`:''}`,()=>choose(a.id)))}
        {!data.list.assignments.length&&<Text style={s.body}>{say('아직 과제가 없어요. 운영자가 첫 과제를 올리면 여기에 나타납니다.','No assignments yet. The owner can create the first one here.')}</Text>}
        {owner&&<View style={s.card}><Text style={s.heading}>{say('새 과제','New assignment')}</Text>
          {input('assignment-title',title,setTitle,say('과제 제목','Assignment title'),120)}
          {input('assignment-instructions',instructions,setInstructions,say('연습할 내용과 제출 기준','Practice instructions and submission criteria'),4000,true)}
          {input('assignment-due',dueDate,setDueDate,say('목표일 (선택, YYYY-MM-DD)','Target date (optional, YYYY-MM-DD)'),10)}
          <Text style={s.small}>{say('목표일이 지나도 제출할 수 있어요. 제출 종료 버튼으로 마감합니다.','Students can submit after the target date until you close submissions.')}</Text>
          {button('assignment-create',say('과제 올리기','Publish assignment'),()=>run('create',withKey('create',{title:title.trim(),instructions:instructions.trim(),dueDate:dueDate.trim()}),r=>{clearDraft();setSelected(r.id);}),!title.trim()||!instructions.trim(),true)}
        </View>}
      </>}
      {assignment&&<>
        <View style={s.card}><Text selectable style={s.body}>{assignment.instructions}</Text><Text style={s.small}>{assignment.closed_at?say('제출 종료','Submissions closed'):assignment.due_date?say(`목표일 ${assignment.due_date} · 이후에도 제출 가능`,`Target ${assignment.due_date} · Late submissions accepted`):say('목표일 없음','No target date')}</Text>
          {owner&&!assignment.closed_at&&button('assignment-close',say('제출 종료','Close submissions'),()=>Alert.alert(say('이 과제 제출을 종료할까요?','Close this assignment?'),say('새 제출을 받지 않습니다. 기존 제출물과 코멘트는 계속 볼 수 있어요.','Existing submissions and comments remain visible. New submissions will be closed.'),[{text:say('취소','Cancel'),style:'cancel'},{text:say('종료','Close'),onPress:()=>run('close')}]))}
        </View>
        {!owner&&!assignment.closed_at&&<View style={s.card}>
          <Text style={s.heading}>{say('내 연습 제출하기','Submit my practice')}</Text>
          {button('assignment-practice',say('이 과제로 새 연습 기록','Start a practice note'),()=>navigation.navigate('NoteCreate',{prefill:{field:'acting',title:assignment.title.slice(0,100),focus:assignment.instructions.slice(0,500)}}))}
          <Text style={s.small}>{say('연습 기록을 저장하고 이 화면으로 돌아와 선택해주세요. 최근 기록 중 공유 가능한 글과 AI 피드백이 있는 30개를 표시합니다.','Save your practice and return here to choose it. Showing up to 30 recent notes with shareable writing or AI feedback.')}</Text>
          {!notes.length&&<Text style={s.body}>{say('공유 가능한 기록이 없어요. 연습 글 또는 AI 피드백을 먼저 저장해주세요. 너무 긴 기록은 제출할 수 없습니다.','Save a note with writing or AI feedback first. Media-only or oversized notes cannot be submitted here.')}</Text>}
          {notes.map(n=>button(`assignment-note-${n.id}`,`${noteId===String(n.id)?'● ':''}${n.title||say('제목 없는 기록','Untitled note')}`,()=>{setNoteId(String(n.id));setConsent(false);} ))}
          {preview&&<View style={s.preview} testID="assignment-preview">
            <Text style={s.heading}>{say('운영자에게 보낼 내용','What the owner will receive')}</Text>
            <Text style={s.body}>{preview.noteTitle}</Text>
            {!!preview.practiceText&&<Text selectable style={s.body}>{preview.practiceText}</Text>}
            {!!preview.aiFeedback&&<><Text style={s.eyebrow}>{say('내 기록에 저장된 AI 피드백','AI FEEDBACK SAVED IN MY NOTE')}</Text><Text selectable style={s.body}>{preview.aiFeedback}</Text></>}
            {!preview.aiFeedback&&button('assignment-add-ai',say('기록에서 AI 피드백 받기','Get AI feedback in this note'),()=>navigation.navigate('NoteDetail',{noteId:note.id,initialTab:'ai'}))}
            {input('assignment-reflection',reflection,v=>{setReflection(v);setConsent(false);},say('다시 연습하며 바꾼 점 또는 질문','What changed, or a question for your teacher'),2000,true)}
            <Text style={s.small}>{say('위 글·AI 피드백·질문만 공유합니다. 영상·녹음·사진 원본은 전송되지 않으며, 다른 학생에게 공개되지 않습니다. AI 피드백 받기는 기존 이용 한도가 적용됩니다.','Only the writing, AI feedback and question above are shared. Original video, audio and images are not uploaded or shown to other students. Existing AI usage limits apply.')}</Text>
            <TouchableOpacity testID="assignment-consent" accessibilityRole="checkbox" accessibilityState={{checked:consent}} aria-checked={consent} disabled={busy} onPress={()=>setConsent(!consent)} style={s.button}><Text style={s.buttonText}>{consent?'☑':'☐'} {say('위 내용을 이 공간 운영자에게 제출하는 데 동의합니다.','I agree to share the above with this group’s owner.')}</Text></TouchableOpacity>
            {button('assignment-submit',say('확인한 내용 제출','Submit reviewed contents'),()=>run('submit',withKey('submit',{...preview,reflection:reflection.trim(),consent:true}),()=>{setNoteId(null);setReflection('');setConsent(false);delete pending.current.submit;}),!consent,true)}
          </View>}
        </View>}
        <Text style={s.heading}>{owner?say('학생 제출 기록','Student submissions'):say('내 제출과 선생님 코멘트','My submissions & teacher feedback')}</Text>
        <Text style={s.small}>{say('최근 제출 200건 · 새 연습 기록으로 다시 제출하면 이전 기록도 남습니다.','Latest 200 submissions · Submit a new note to keep both attempts.')}</Text>
        {!submissions.length&&<Text style={s.body}>{say('아직 제출된 기록이 없어요.','No submissions yet.')}</Text>}
        {submissions.map(item=><View key={item.id} testID={`submission-${item.id}`} style={s.card}>
          <Text style={s.eyebrow}>{item.author_name} · {new Date(item.created_at).toLocaleString(ko?'ko-KR':'en-US')}{item.previous_id?say(' · 재제출',' · Resubmission'):''}</Text>
          <Text style={s.heading}>{item.note_title}</Text>
          {!!item.practice_text&&<Text selectable style={s.body}>{item.practice_text}</Text>}
          {!!item.ai_feedback&&<><Text style={s.small}>{say('학생이 공유한 AI 피드백','AI feedback shared by the student')}</Text><Text selectable style={s.body}>{item.ai_feedback}</Text></>}
          {!!item.reflection&&<Text style={s.body}>{say('바꾼 점·질문: ','Reflection: ')}{item.reflection}</Text>}
          {item.teacher_comment?<View style={s.feedback}><Text style={s.heading}>{say('선생님 코멘트','Teacher feedback')}</Text><Text selectable style={s.body}>{item.teacher_comment}</Text></View>:<Text style={s.small}>{say('선생님 코멘트를 기다리고 있어요.','Waiting for teacher feedback.')}</Text>}
          {owner&&button(`assignment-review-${item.id}`,item.teacher_comment?say('코멘트 수정','Edit feedback'):say('코멘트 작성','Write feedback'),()=>{if(comment.trim()&&reviewId!==item.id){Alert.alert(say('작성 중인 코멘트를 먼저 저장해주세요.','Save your current feedback first.'));return;}setReviewId(item.id);setComment(item.teacher_comment||'');})}
          {owner&&reviewId===item.id&&<>{input('assignment-comment',comment,setComment,say('다음 연습에서 바꿔볼 한 가지','One thing to work on next'),4000,true)}{button('assignment-review-save',say('코멘트 저장','Save feedback'),()=>run('review',{submissionId:item.id,comment:comment.trim()},()=>{setReviewId(null);setComment('');}),!comment.trim(),true)}</>}
        </View>)}
      </>}
      </>}
      {busy&&<ActivityIndicator/>}
    </ScrollView></KeyboardAvoidingView>
  </SafeAreaView>;
}
const s=StyleSheet.create({
  safe:{flex:1,backgroundColor:C.background},top:{padding:12,flexDirection:'row',alignItems:'center',gap:12},page:{padding:20,paddingBottom:40,gap:16},
  title:{fontSize:26,lineHeight:35,fontWeight:'800',color:C.ink},heading:{fontSize:17,lineHeight:25,fontWeight:'700',color:C.ink},eyebrow:{fontSize:12,lineHeight:19,fontWeight:'700',color:C.positive},body:{fontSize:15,lineHeight:24,color:C.ink},small:{fontSize:12,lineHeight:19,color:C.muted},
  card:{padding:16,borderRadius:18,borderWidth:1,borderColor:C.line,backgroundColor:C.paper,gap:12},metrics:{padding:16,borderRadius:18,backgroundColor:C.positiveSoft,gap:8},preview:{gap:12,paddingTop:12,borderTopWidth:1,borderColor:C.line},feedback:{padding:12,borderRadius:12,backgroundColor:C.positiveSoft,gap:8},
  input:{minHeight:48,padding:12,borderWidth:1,borderColor:C.line,borderRadius:12,fontSize:16,color:C.ink,backgroundColor:C.paper},multiline:{minHeight:100,textAlignVertical:'top'},button:{padding:12,minHeight:44,borderRadius:12,backgroundColor:C.quiet,justifyContent:'center'},buttonText:{fontSize:14,lineHeight:22,fontWeight:'700',color:C.ink},primary:{backgroundColor:'#AD194A'},white:{color:'#FFF'},disabled:{opacity:0.4},error:{fontSize:14,lineHeight:22,color:'#A02534'},success:{fontSize:14,color:C.positive},
});
