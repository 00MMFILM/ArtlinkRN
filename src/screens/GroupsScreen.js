import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, ScrollView, TouchableOpacity, ActivityIndicator, StyleSheet, Alert, AppState, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { usePreventRemove } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { useApp } from '../context/AppContext';
import { STUDIO as C } from '../constants/studioTheme';
import { groupAction, groupErrorMessage } from '../services/groupService';
import { newUuid } from '../services/practiceService';

const kinds={academy:['학원','Academy'],theatre:['극단','Theatre'],band:['밴드·음악','Music'],dance:['무용단','Dance'],art:['미술 작업실','Art studio'],writing:['합평 모임','Writing circle'],film:['영화 제작팀','Film crew'],collective:['창작 모임','Collective']};

export default function GroupsScreen({ navigation }) {
  const context = useApp();
  const { i18n } = useTranslation();
  const accountId = context.userProfile?.authUserId;
  return <GroupWorkspace key={accountId || 'guest'} accountId={accountId} context={context} navigation={navigation} ko={String(i18n.language).startsWith('ko')} />;
}

function GroupWorkspace({ accountId, context, navigation, ko }) {
  const say = (a, b) => ko ? a : b;
  const [groups, setGroups] = useState([]), [selected, setSelected] = useState(null), [room, setRoom] = useState(null);
  const [tab, setTab] = useState('notice'), [busy, setBusy] = useState(false), [loading, setLoading] = useState(true), [error, setError] = useState('');
  const [name, setName] = useState(''), [kind, setKind] = useState('academy'), [displayName, setDisplayName] = useState(context.userProfile?.name || '');
  const [menuEntryId, setMenuEntryId] = useState(null);
  const [code, setCode] = useState(''), [invite, setInvite] = useState(null), [body, setBody] = useState(''), [title, setTitle] = useState('');
  const scroll = useRef(null), scrollToChat = useRef(false);
  const drafts = useRef({ notice: { body: '', title: '' }, message: { body: '', title: '' } });
  const epoch = useRef(0), lock = useRef(false), pendingPost = useRef({}), mounted = useRef(true);
  const active = useRef(AppState.currentState === 'active'), focused = useRef(true);
  useEffect(() => () => { mounted.current = false; epoch.current++; }, []);

  useEffect(() => {
    const generation = ++epoch.current;
    let running = false;
    const current = () => mounted.current && epoch.current === generation;
    const load = async () => {
      if (!accountId || running || !active.current || !focused.current) { if (!accountId) setLoading(false); return; }
      running = true;
      try {
        const data = await groupAction(accountId, selected ? 'read' : 'list', selected?.id);
        if (!current() || !active.current || !focused.current) return;
        if (selected) setRoom(data); else setGroups(data);
        setError('');
      } catch (e) {
        if (!current()) return;
        setError(groupErrorMessage(e, ko));
        if (['GROUP_ACCESS_DENIED','GROUP_LOGIN_REQUIRED','GROUP_ACCOUNT_CHANGED'].includes(e.message)) { setRoom(null); setGroups([]); setInvite(null); }
      } finally { running = false; if (current()) setLoading(false); }
    };
    setRoom(null); setInvite(null); setLoading(true); setError(''); load();
    const timer = setInterval(load, 5000);
    const app = AppState.addEventListener('change', state => { active.current = state === 'active'; if (!active.current) { setRoom(null); setInvite(null); } else load(); });
    const offBlur = navigation.addListener?.('blur', () => { focused.current = false; setRoom(null); setInvite(null); });
    const offFocus = navigation.addListener?.('focus', () => { focused.current = true; load(); });
    return () => { epoch.current++; clearInterval(timer); app.remove(); offBlur?.(); offFocus?.(); };
  }, [accountId, selected?.id, ko, navigation]);

  const changeGroup = (group) => { epoch.current++; setSelected(group); setRoom(null); setInvite(null); setBody(''); setTitle(''); setTab('notice'); setMenuEntryId(null); drafts.current = { notice: { body: '', title: '' }, message: { body: '', title: '' } }; pendingPost.current = {}; };
  const run = async (action, payload = {}) => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError('');
    const generation = epoch.current;
    const current = () => mounted.current && epoch.current === generation && active.current && focused.current;
    try {
      const result = await groupAction(accountId, action, selected?.id, payload);
      if (!current()) return;
      if (action === 'create' || action === 'join') { setCode(''); changeGroup(result); }
      else if (action === 'invite') setInvite(result);
      else if (action === 'leave') changeGroup(null);
      else {
        if (action === 'post') { scrollToChat.current = tab === 'message'; setBody(''); setTitle(''); drafts.current[tab] = { body: '', title: '' }; delete pendingPost.current[tab]; }
        const fresh = await groupAction(accountId, 'read', selected?.id);
        if (current()) setRoom(fresh);
      }
    } catch (e) {
      if (current()) {
        setError(groupErrorMessage(e, ko));
        if (['GROUP_ACCESS_DENIED','GROUP_LOGIN_REQUIRED','GROUP_ACCOUNT_CHANGED'].includes(e.message)) { setRoom(null); setInvite(null); }
      }
    } finally { lock.current = false; if (mounted.current) setBusy(false); }
  };
  const switchTab = value => {
    if (tab !== 'members') drafts.current[tab] = { body, title };
    const draft = drafts.current[value] || { body: '', title: '' };
    scrollToChat.current = value === 'message';
    setTab(value); setBody(draft.body); setTitle(draft.title); setMenuEntryId(null);
  };
  const hasUnsentDraft = !!(body.trim() || title.trim() || Object.values(drafts.current).some(d => d.body.trim() || d.title.trim()));
  usePreventRemove(hasUnsentDraft, ({ data }) => Alert.alert(say('작성 중인 글이 있어요','You have an unsent draft'),say('나가면 이 글은 저장되지 않습니다.','Leaving discards this draft.'),[
    { text: say('계속 작성','Keep writing'), style: 'cancel' },
    { text: say('나가기','Leave'), style: 'destructive', onPress: () => navigation.dispatch(data.action) },
  ]));
  const post = () => {
    const payload = { kind: tab, body: body.trim(), title: tab === 'notice' ? title.trim() : '' };
    const fingerprint = JSON.stringify(payload);
    if (pendingPost.current[tab]?.fingerprint !== fingerprint) pendingPost.current[tab] = { fingerprint, clientId: newUuid() };
    run('post', { ...payload, clientId: pendingPost.current[tab].clientId });
  };
  const button = (id, label, onPress, disabled = false, primary = false) => <TouchableOpacity key={id} testID={id} accessibilityRole="button" accessibilityState={{ disabled: disabled || busy }} disabled={disabled || busy} onPress={onPress} style={[s.button, primary && s.primary, (disabled || busy) && { opacity: 0.4 }]}><Text style={[s.buttonText, primary && s.white]}>{label}</Text></TouchableOpacity>;
  const input = (id, value, onChange, placeholder, maxLength = 60, multiline = false) => <TextInput testID={id} accessibilityLabel={placeholder} placeholder={placeholder} placeholderTextColor={C.muted} value={value} onChangeText={onChange} maxLength={maxLength} multiline={multiline} editable={!busy} autoCapitalize={id === 'group-code' ? 'none' : 'sentences'} autoCorrect={id !== 'group-code'} style={[s.input, multiline && { minHeight: 88, textAlignVertical: 'top' }]} />;
  const confirm = (label, action) => Alert.alert(label, say('이 작업을 진행할까요?', 'Continue with this action?'), [{ text: say('취소','Cancel'), style: 'cancel' }, { text: say('확인','Confirm'), style: 'destructive', onPress: action }]);
  const owner = room?.role === 'owner';
  const blocked = context.blockedUsers || [];
  const entry = item => <View key={item.id} style={[s.entry, item.kind === 'message' && s.bubble, item.kind === 'message' && item.author_id === accountId && s.ownBubble]} testID={`group-entry-${item.id}`}>
    <Text style={s.small}>{item.author_name} · {new Date(item.created_at).toLocaleString(ko ? 'ko-KR' : 'en-US')}</Text>
    {!!item.title && <Text style={s.heading}>{item.title}</Text>}
    <Text selectable style={s.body}>{item.body}</Text>
    {button(`group-menu-${item.id}`,say('메시지 메뉴 ···','Message options ···'),()=>setMenuEntryId(menuEntryId===item.id ? null : item.id))}
    {menuEntryId===item.id && <View style={s.row}>
      {(owner || item.author_id===accountId) && button(`group-delete-${item.id}`,say('삭제','Delete'),()=>confirm(say('이 글 삭제','Delete this entry'),()=>run('delete_entry',{entryId:item.id})))}
      {item.author_id!==accountId && <>
        {button(`group-report-${item.id}`,say('신고','Report'),()=>confirm(say('이 글 신고','Report this entry'),()=>context.handleReportContent({ type: 'group_entry', groupId: selected.id, entryId: item.id, authorId: item.author_id, content: item.body })))}
        {button(`group-hide-${item.id}`,say('작성자 숨기기','Hide author'),()=>context.handleBlockUser(`group-user:${item.author_id}`))}
      </>}
      {button(`group-menu-close-${item.id}`,say('닫기','Close'),()=>setMenuEntryId(null))}
    </View>}
  </View>;
  return <SafeAreaView style={s.safe} edges={['top','bottom']}>
    <View style={s.top}>{button('groups-back',say('뒤로','Back'),()=>{ const leave=()=>selected ? changeGroup(null) : navigation.goBack(); if (body.trim() || title.trim() || Object.values(drafts.current).some(d=>d.body.trim()||d.title.trim())) confirm(say('작성 중인 글을 두고 나가기','Discard unsent draft'),leave); else leave(); })}<Text style={s.heading}>{say('창작 모임','Private groups')}</Text></View>
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView ref={scroll} onContentSizeChange={() => { if (scrollToChat.current) { scrollToChat.current = false; scroll.current?.scrollToEnd({ animated: false }); } }} contentContainerStyle={s.page} keyboardShouldPersistTaps="handled">
      <Text style={s.eyebrow}>{say('함께 연습하는 사람들의 공간','YOUR CREATIVE GROUP')}</Text>
      <Text style={s.title}>{selected?.name || say('공지부터 연습 이야기까지.','Notices and rehearsal conversations.')}</Text>
      {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
      {!accountId ? <View style={s.card}><Text style={s.body}>{say('가입한 구성원만 공지와 대화를 볼 수 있어요. 로그인하고 초대코드로 들어오세요.','Only members can read notices and conversations. Sign in and use an invitation code.')}</Text>{button('groups-login',say('로그인하기','Sign in'),()=>context.requestGroupLogin(),false,true)}</View> : loading ? <ActivityIndicator /> : !selected ? <>
        <Text style={s.body}>{say('초대받은 구성원끼리 쓰는 비공개 공간입니다.','A private space for invited members.')}</Text>
        {groups.map(group => button(`group-open-${group.id}`,`${(kinds[group.kind]||kinds.collective)[ko?0:1]} · ${group.name}`,()=>changeGroup(group)))}
        <View style={s.card}><Text style={s.heading}>{say('공간에서 사용할 이름','Your name in this group')}</Text>{input('group-display-name',displayName,setDisplayName,say('구성원에게 보여줄 이름','Name shown to members'),40)}</View>
        <View style={s.card}><Text style={s.heading}>{say('초대코드로 가입','Join with a code')}</Text>{input('group-code',code,setCode,say('운영자에게 받은 초대코드','Invitation code'),32)}{button('group-join',say('가입하기','Join'),()=>run('join',{code:code.trim(),displayName:displayName.trim()}),!code.trim()||!displayName.trim(),true)}</View>
        <View style={s.card}><Text style={s.heading}>{say('우리 단체 공간 만들기','Create your group')}</Text><View style={[s.row,{flexWrap:'wrap'}]}>{Object.keys(kinds).map(value => button(`group-kind-${value}`,`${kind===value?'● ':''}${kinds[value][ko?0:1]}`,()=>setKind(value)))}</View>{input('group-name',name,setName,say('모임 또는 단체 이름','Group name'))}{button('group-create',say('비공개 공간 만들기','Create private group'),()=>run('create',{name:name.trim(),kind,displayName:displayName.trim()}),!name.trim()||!displayName.trim(),true)}</View>
      </> : room ? <>
        <View style={s.row}>{[['notice','공지','Notices'],['message','대화','Chat'],['members','구성원','Members']].map(([value,kr,en])=>button(`group-tab-${value}`,`${tab===value?'● ':''}${say(kr,en)}`,()=>switchTab(value)))}</View>
        {button('group-assignments',say('과제와 피드백','Assignments & feedback'),()=>navigation.navigate('GroupAssignments',{groupId:selected.id,groupName:selected.name}),false,true)}
        {tab === 'members' ? <View style={s.card}>
          {owner && button('group-invite',say('새 초대코드 만들기','Generate new invitation'),()=>Alert.alert(say('초대코드 만들기','Generate an invitation'),say('새 코드는 7일간 유효하며, 기존 초대코드는 즉시 만료됩니다.','The new code lasts 7 days. Any previous code expires immediately.'),[{text:say('취소','Cancel'),style:'cancel'},{text:say('만들기','Generate'),onPress:()=>run('invite')}]))}
          {invite && <View><Text selectable testID="group-invite-code" style={s.body}>{invite.code}</Text><Text style={s.small}>{say('길게 눌러 복사 · 7일간 유효합니다. 이전 코드는 만료됩니다.','Hold to copy · Valid for 7 days. Older codes stop working.')}</Text></View>}
          {room.members.map(member=><View key={member.user_id} style={s.entry}><Text style={s.body}>{member.display_name}{member.role==='owner'?say(' · 운영자',' · Owner'):''}</Text>{owner && member.user_id!==accountId && button(`group-remove-${member.user_id}`,say('구성원 제외','Remove member'),()=>confirm(say('이 구성원의 접근 차단','Remove this member’s access'),()=>run('remove_member',{userId:member.user_id})))}</View>)}
          {!owner && button('group-leave',say('이 공간 나가기','Leave group'),()=>confirm(say('단체 공간 나가기','Leave this group'),()=>run('leave')))}
        </View> : <>
          <Text style={s.small}>{tab==='notice'?say('운영자가 올린 최근 공지 30개','Latest 30 owner notices'):say('최근 대화 100개 · 화면을 보고 있을 때 5초마다 갱신됩니다.','Latest 100 messages · Refreshes every 5 seconds while viewing.')}</Text>
          {(tab==='notice'?room.notices:room.messages).filter(item=>!blocked.includes(`group-user:${item.author_id}`)).map(entry)}
          {!(tab==='notice'?room.notices:room.messages).length && <Text style={s.body}>{say('아직 올라온 글이 없어요.','No posts yet.')}</Text>}
          {(tab==='message'||owner) && <View style={s.card}>{tab==='notice' && input('group-notice-title',title,setTitle,say('공지 제목','Notice title'),120)}{input('group-body',body,setBody,tab==='notice'?say('구성원에게 전할 공지','Notice for members'):say('함께 나눌 이야기','Message to the group'),4000,true)}{button('group-send',tab==='notice'?say('공지 올리기','Post notice'):say('보내기','Send'),post,!body.trim()||(tab==='notice'&&!title.trim()),true)}</View>}
        </>}
      </> : <Text style={s.body}>{say('공간을 불러오는 중입니다. 연결 상태를 확인해주세요.','Waiting for this group. Check your connection.')}</Text>}
      {busy && <ActivityIndicator />}
    </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}
const s = StyleSheet.create({
  safe:{flex:1,backgroundColor:C.background}, top:{padding:12,flexDirection:'row',alignItems:'center',gap:12}, page:{padding:20,paddingBottom:40,gap:16},
  eyebrow:{fontSize:12,fontWeight:'700',color:C.positive},title:{fontSize:26,lineHeight:35,fontWeight:'800',color:C.ink},heading:{fontSize:17,lineHeight:25,fontWeight:'700',color:C.ink},body:{fontSize:15,lineHeight:24,color:C.ink},small:{fontSize:12,lineHeight:19,color:C.muted},
  card:{borderRadius:18,borderWidth:1,borderColor:C.line,backgroundColor:C.paper,padding:16,gap:12},entry:{padding:14,borderBottomWidth:1,borderColor:C.line,gap:8},row:{flexDirection:'row',flexWrap:'wrap',gap:8},input:{borderWidth:1,borderColor:C.line,borderRadius:12,padding:12,fontSize:16,color:C.ink,backgroundColor:C.paper,minHeight:48},
  bubble:{maxWidth:'92%',alignSelf:'flex-start',backgroundColor:C.paper,borderWidth:1,borderColor:C.line,borderRadius:16},ownBubble:{alignSelf:'flex-end',backgroundColor:C.accentSoft},
  button:{padding:12,minHeight:44,borderRadius:12,backgroundColor:C.quiet,alignItems:'center',justifyContent:'center'},buttonText:{fontSize:14,color:C.ink,fontWeight:'700'},primary:{backgroundColor:'#AD194A'},white:{color:'#FFF'},error:{fontSize:14,lineHeight:22,color:'#A02534'},
});
