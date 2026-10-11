import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { AppState } from 'react-native';
import GroupsScreen from '../GroupsScreen';
import { useApp } from '../../context/AppContext';
import { newUuid } from '../../services/practiceService';
import { groupAction } from '../../services/groupService';
jest.mock('@react-navigation/native',()=>({usePreventRemove:jest.fn()}));
jest.mock('react-i18next',()=>({useTranslation:()=>({i18n:{language:'ko'}})}));
jest.mock('../../context/AppContext',()=>({useApp:jest.fn()}));
jest.mock('../../services/groupService',()=>({groupAction:jest.fn(),groupErrorMessage:(e)=>e.message}));
jest.mock('../../services/practiceService',()=>({newUuid:jest.fn(()=>'message-key')}));
jest.mock('react-native-safe-area-context',()=>({SafeAreaView:({children})=>children}));
const listeners={};
const navigation={goBack:jest.fn(),addListener:jest.fn((key,fn)=>{listeners[key]=fn;return jest.fn();})};
const group={id:'group-a',name:'예술학원',kind:'academy'};
const room={group,role:'member',members:[],notices:[],messages:[]};
const context={userProfile:{authUserId:'a',name:'학생'},blockedUsers:[],setAuthState:jest.fn(),handleBlockUser:jest.fn(),handleReportContent:jest.fn()};
beforeEach(()=>{jest.clearAllMocks();AppState.currentState='active';useApp.mockReturnValue(context);groupAction.mockImplementation(async(_id,action)=>action==='list'?[group]:room);});
async function open(u){await waitFor(()=>u.getByTestId('group-open-group-a'));fireEvent.press(u.getByTestId('group-open-group-a'));await waitFor(()=>u.getByTestId('group-tab-message'));}
test('guests cannot create or read groups',()=>{
  useApp.mockReturnValue({...context,userProfile:{}});const u=render(<GroupsScreen navigation={navigation}/>);
  expect(u.getByTestId('groups-login')).toBeTruthy();expect(groupAction).not.toHaveBeenCalled();expect(u.queryByTestId('group-create')).toBeNull();
});
test('members can chat but cannot publish notices or generate invites',async()=>{
  const u=render(<GroupsScreen navigation={navigation}/>);await open(u);
  expect(u.queryByTestId('group-send')).toBeNull();
  fireEvent.press(u.getByTestId('group-tab-members'));expect(u.queryByTestId('group-invite')).toBeNull();
  fireEvent.press(u.getByTestId('group-tab-message'));fireEvent.changeText(u.getByTestId('group-body'),'연습 시간 확인했습니다.');
  await act(async()=>fireEvent.press(u.getByTestId('group-send')));
  expect(groupAction).toHaveBeenCalledWith('a','post','group-a',expect.objectContaining({kind:'message',body:'연습 시간 확인했습니다.',clientId:'message-key'}));
});
test('failed sends retain draft and reuse idempotency key on retry',async()=>{
  let fails=true;groupAction.mockImplementation(async(_id,action)=>{if(action==='post'&&fails){fails=false;throw new Error('offline');}return action==='list'?[group]:room;});
  const u=render(<GroupsScreen navigation={navigation}/>);await open(u);fireEvent.press(u.getByTestId('group-tab-message'));
  fireEvent.changeText(u.getByTestId('group-body'),'hello');await act(async()=>fireEvent.press(u.getByTestId('group-send')));
  expect(u.getByTestId('group-body').props.value).toBe('hello');await act(async()=>fireEvent.press(u.getByTestId('group-send')));
  const sends=groupAction.mock.calls.filter(c=>c[1]==='post');expect(sends).toHaveLength(2);expect(sends[0][3].clientId).toBe(sends[1][3].clientId);
});
test('private content is cleared when the screen loses focus',async()=>{
  groupAction.mockImplementation(async(_id,action)=>action==='list'?[group]:{...room,notices:[{id:'n',author_id:'o',author_name:'선생님',body:'비공개 리허설',created_at:new Date().toISOString()}]});
  const u=render(<GroupsScreen navigation={navigation}/>);await open(u);expect(u.getByText('비공개 리허설')).toBeTruthy();
  act(()=>listeners.blur());expect(u.queryByText('비공개 리허설')).toBeNull();
});

test('switching between notices and chat preserves the unsent draft',async()=>{
  const u=render(<GroupsScreen navigation={navigation}/>);await open(u);fireEvent.press(u.getByTestId('group-tab-message'));fireEvent.changeText(u.getByTestId('group-body'),'keep me');fireEvent.press(u.getByTestId('group-tab-notice'));fireEvent.press(u.getByTestId('group-tab-message'));expect(u.getByTestId('group-body').props.value).toBe('keep me');
});

test('switching tabs after an uncertain send retains the same retry key',async()=>{
  newUuid.mockReturnValueOnce('first-key').mockReturnValueOnce('wrong-new-key');
  groupAction.mockImplementation(async(_id,action)=>{if(action==='post')throw new Error('offline');return action==='list'?[group]:room;});
  const u=render(<GroupsScreen navigation={navigation}/>);await open(u);fireEvent.press(u.getByTestId('group-tab-message'));
  fireEvent.changeText(u.getByTestId('group-body'),'retry this');await act(async()=>fireEvent.press(u.getByTestId('group-send')));
  fireEvent.press(u.getByTestId('group-tab-notice'));fireEvent.press(u.getByTestId('group-tab-message'));
  await act(async()=>fireEvent.press(u.getByTestId('group-send')));
  expect(groupAction.mock.calls.filter(c=>c[1]==='post').map(c=>c[3].clientId)).toEqual(['first-key','first-key']);
});
test('a write finishing after blur cannot restore private room content',async()=>{
  let finish;
  groupAction.mockImplementation(async(_id,action)=>action==='list'?[group]:action==='post'?new Promise(resolve=>{finish=resolve;}):{...room,notices:[{id:'n',author_id:'o',author_name:'선생님',body:'비공개 공지',created_at:new Date().toISOString()}]});
  const u=render(<GroupsScreen navigation={navigation}/>);await open(u);fireEvent.press(u.getByTestId('group-tab-message'));
  fireEvent.changeText(u.getByTestId('group-body'),'hello');fireEvent.press(u.getByTestId('group-send'));
  await waitFor(()=>expect(finish).toBeDefined());act(()=>listeners.blur());
  await act(async()=>finish({id:'posted'}));
  expect(u.queryByTestId('group-tab-notice')).toBeNull();expect(u.queryByText('비공개 공지')).toBeNull();
});
test('owners can access all moderation actions without exceeding native alert button limits',async()=>{
  groupAction.mockImplementation(async(_id,action)=>action==='list'?[group]:{...room,role:'owner',notices:[{id:'n',author_id:'o',author_name:'구성원',body:'공지',created_at:new Date().toISOString()}]});
  const u=render(<GroupsScreen navigation={navigation}/>);await open(u);fireEvent.press(u.getByTestId('group-menu-n'));
  expect(u.getByTestId('group-delete-n')).toBeTruthy();expect(u.getByTestId('group-report-n')).toBeTruthy();expect(u.getByTestId('group-hide-n')).toBeTruthy();
});
