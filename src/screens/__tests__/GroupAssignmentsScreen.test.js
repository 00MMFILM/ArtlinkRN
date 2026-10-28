import React from 'react';
import {render,fireEvent,waitFor,act} from '@testing-library/react-native';
import {AppState,Alert} from 'react-native';
import GroupAssignmentsScreen from '../GroupAssignmentsScreen';
import {useApp} from '../../context/AppContext';
import {assignmentAction} from '../../services/groupService';
jest.mock('@react-navigation/native',()=>({usePreventRemove:jest.fn()}));
jest.mock('react-i18next',()=>({useTranslation:()=>({i18n:{language:'ko'}})}));
jest.mock('../../context/AppContext',()=>({useApp:jest.fn()}));
jest.mock('../../services/groupService',()=>({assignmentAction:jest.fn(),groupErrorMessage:e=>e.message}));
jest.mock('../../services/practiceService',()=>({newUuid:()=> 'stable-client-id'}));
jest.mock('react-native-safe-area-context',()=>({SafeAreaView:({children})=>children}));
const listeners={};
const navigation={navigate:jest.fn(),goBack:jest.fn(),dispatch:jest.fn(),addListener:jest.fn((name,fn)=>{listeners[name]=fn;return jest.fn();})};
const route={params:{groupId:'g',groupName:'Test academy'}};
const assignment={id:'a',title:'Listen',instructions:'Try pausing.',closed_at:null};
const note={id:'note-1',title:'My practice',content:'I tried a pause.',aiComment:'Keep listening.',images:[{uri:'file:///private/photo.jpg'}],transcript:'UNSHARED TRANSCRIPT'};
const context={userProfile:{authUserId:'student'},savedNotes:[note]};
let role;
beforeEach(()=>{
  jest.clearAllMocks();role='member';AppState.currentState='active';useApp.mockReturnValue(context);
  assignmentAction.mockImplementation(async(_user,action)=>action==='list'?{role,assignments:[assignment],metrics:role==='owner'?{members:2,submitters:1,submissions:1,feedbackShared:1,reviewed:0,repeaters:0,repeatersWithin7Days:0}:null}:action==='read'?{assignment,role,submissions:[]}:{});
});
const screen=()=>render(<GroupAssignmentsScreen route={route} navigation={navigation}/>);
async function open(u){await waitFor(()=>u.getByTestId('assignment-open-a'));fireEvent.press(u.getByTestId('assignment-open-a'));await waitFor(()=>u.getByText('Try pausing.'));}
async function select(u){await open(u);fireEvent.press(u.getByTestId('assignment-note-note-1'));}
test('a student cannot create, close or see owner metrics',async()=>{const u=screen();await open(u);expect(u.queryByTestId('assignment-close')).toBeNull();expect(u.queryByTestId('assignment-create')).toBeNull();expect(u.queryByTestId('assignment-metrics')).toBeNull();});
test('sharing requires preview and consent and never includes local media or transcript',async()=>{
  const u=screen();await select(u);expect(u.getByTestId('assignment-submit').props.accessibilityState.disabled).toBe(true);
  expect(u.queryByText('UNSHARED TRANSCRIPT')).toBeNull();fireEvent.press(u.getByTestId('assignment-consent'));
  await act(async()=>fireEvent.press(u.getByTestId('assignment-submit')));
  const args=assignmentAction.mock.calls.find(c=>c[1]==='submit');
  expect(args).toEqual(['student','submit','g',{assignmentId:'a',noteKey:'note-1',noteTitle:'My practice',practiceText:'I tried a pause.',aiFeedback:'Keep listening.',reflection:'',consent:true,clientId:'stable-client-id'}]);
  expect(u.queryByTestId('assignment-preview')).toBeNull();
});
test('failed submission keeps draft and the same retry id',async()=>{
  const normal=assignmentAction.getMockImplementation();let failed=false;
  assignmentAction.mockImplementation(async(...args)=>{if(args[1]==='submit'&&!failed){failed=true;throw new Error('offline');}return normal(...args);});
  const u=screen();await select(u);fireEvent.changeText(u.getByTestId('assignment-reflection'),'Please review my pause.');fireEvent.press(u.getByTestId('assignment-consent'));
  await act(async()=>fireEvent.press(u.getByTestId('assignment-submit')));expect(u.getByTestId('assignment-reflection').props.value).toBe('Please review my pause.');
  await act(async()=>fireEvent.press(u.getByTestId('assignment-submit')));
  const sends=assignmentAction.mock.calls.filter(c=>c[1]==='submit');expect(sends).toHaveLength(2);expect(sends[0][3].clientId).toBe(sends[1][3].clientId);
});
test('changing a shared note revokes consent',async()=>{
  const u=screen();await select(u);fireEvent.press(u.getByTestId('assignment-consent'));
  useApp.mockReturnValue({...context,savedNotes:[{...note,aiComment:'Updated feedback.'}]});u.rerender(<GroupAssignmentsScreen route={route} navigation={navigation}/>);
  expect(u.getByTestId('assignment-consent').props.accessibilityState.checked).toBe(false);
});
test('blur hides private contents and forces consent again after return',async()=>{
  const u=screen();await select(u);fireEvent.press(u.getByTestId('assignment-consent'));
  act(()=>listeners.blur());expect(u.queryByText('I tried a pause.')).toBeNull();
  await act(async()=>listeners.focus());expect(u.getByTestId('assignment-consent').props.accessibilityState.checked).toBe(false);
});
test('account changes discard another account submission preview',async()=>{
  const u=screen();await select(u);
  useApp.mockReturnValue({...context,userProfile:{authUserId:'other'},savedNotes:[]});u.rerender(<GroupAssignmentsScreen route={route} navigation={navigation}/>);
  await waitFor(()=>expect(u.queryByTestId('assignment-preview')).toBeNull());expect(u.queryByText('I tried a pause.')).toBeNull();
});
test('removed member loses already loaded submissions on refresh',async()=>{
  const u=screen();await open(u);assignmentAction.mockRejectedValue(new Error('GROUP_ACCESS_DENIED'));
  await act(async()=>fireEvent.press(u.getByTestId('assignment-refresh')));expect(u.queryByText('Try pausing.')).toBeNull();
});
test('owner can publish a dated assignment and sees metrics',async()=>{
  role='owner';const normal=assignmentAction.getMockImplementation();assignmentAction.mockImplementation(async(...args)=>args[1]==='create'?assignment:normal(...args));
  const u=screen();await waitFor(()=>u.getByTestId('assignment-create'));expect(u.getByTestId('assignment-metrics')).toBeTruthy();
  fireEvent.changeText(u.getByTestId('assignment-title'),'Listen');fireEvent.changeText(u.getByTestId('assignment-instructions'),'Try pausing.');fireEvent.changeText(u.getByTestId('assignment-due'),'2026-11-01');
  await act(async()=>fireEvent.press(u.getByTestId('assignment-create')));expect(assignmentAction).toHaveBeenCalledWith('student','create','g',{field:'acting',title:'Listen',instructions:'Try pausing.',dueDate:'2026-11-01',clientId:'stable-client-id'});
  await waitFor(()=>u.getByTestId('assignment-close'));expect(u.queryByTestId('assignment-submit')).toBeNull();
});
test('owner saves a comment to the selected student submission only',async()=>{
  role='owner';const normal=assignmentAction.getMockImplementation();assignmentAction.mockImplementation(async(...args)=>args[1]==='read'?{assignment,role,submissions:[{id:'s1',author_name:'Student',note_title:'Take 1',practice_text:'A scene',created_at:'2026-10-15T00:00:00Z'}]}:normal(...args));
  const u=screen();await open(u);fireEvent.press(u.getByTestId('assignment-review-s1'));fireEvent.changeText(u.getByTestId('assignment-comment'),'Keep listening.');
  await act(async()=>fireEvent.press(u.getByTestId('assignment-review-save')));expect(assignmentAction).toHaveBeenCalledWith('student','review','g',{assignmentId:'a',submissionId:'s1',comment:'Keep listening.'});
});
test('a closed assignment keeps past feedback but disables new submissions',async()=>{
  const normal=assignmentAction.getMockImplementation();assignmentAction.mockImplementation(async(...args)=>args[1]==='read'?{assignment:{...assignment,closed_at:'2026-10-15'},role,submissions:[]}:normal(...args));
  const u=screen();await open(u);expect(u.queryByTestId('assignment-practice')).toBeNull();expect(u.queryByTestId('assignment-submit')).toBeNull();
});

test('music assignment starts a music record and opens media submissions in the same field',async()=>{
 const normal=assignmentAction.getMockImplementation();assignmentAction.mockImplementation(async(...args)=>args[1]==='read'?{assignment:{...assignment,field:'music'},role,submissions:[]}:normal(...args));
 const u=screen();await open(u);fireEvent.press(u.getByTestId('assignment-practice'));expect(navigation.navigate).toHaveBeenCalledWith('NoteCreate',{prefill:{field:'music',title:'Listen',focus:'Try pausing.'}});
 fireEvent.press(u.getByTestId('assignment-artwork'));expect(navigation.navigate).toHaveBeenCalledWith('ReviewRoom',{assignmentId:'a',field:'music',title:'Listen'});
});
