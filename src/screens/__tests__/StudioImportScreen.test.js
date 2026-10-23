import React from 'react';
import {render,fireEvent,waitFor,act} from '@testing-library/react-native';
import StudioImportScreen from '../StudioImportScreen';
import {useApp} from '../../context/AppContext';
import {readStudioTransfer} from '../../services/studioImportService';
import {importedNote,importedNoteId} from '../../utils/studioImport';
jest.mock('../../context/AppContext',()=>({useApp:jest.fn()}));
jest.mock('../../services/studioImportService',()=>({readStudioTransfer:jest.fn()}));
jest.mock('../../utils/accountStorage',()=>({getStorageScope:()=> 'account:test'}));
jest.mock('react-native-safe-area-context',()=>({SafeAreaView:require('react-native').View}));
const value={id:'a'.repeat(64),review:{version:1,field:'literature',lang:'ko',title:'퇴고',role:'소설',intent:'행동으로',notes:[{body:'컵을 남기기',label:'B',resolved:false}],settings:{},texts:{a:'슬펐다.',b:'컵을 내려놓았다.'}}};
let ctx,nav;
beforeEach(()=>{jest.clearAllMocks();ctx={handleSaveNote:jest.fn(async()=>importedNoteId(value.id)),userProfile:{authUserId:'A'},isKoreanLocale:true};useApp.mockImplementation(()=>ctx);readStudioTransfer.mockResolvedValue(importedNote(value));nav={replace:jest.fn(),goBack:jest.fn()};});
const mount=()=>render(<StudioImportScreen navigation={nav} route={{params:{code:'a'.repeat(24)}}}/>);
test('deep link previews full original/revision; save requires explicit action',async()=>{
 const ui=mount();await waitFor(()=>expect(ui.getByTestId('studio-save')).toBeTruthy());expect(ctx.handleSaveNote).not.toHaveBeenCalled();expect(ui.getByText(/컵을 내려놓았다/)).toBeTruthy();fireEvent.press(ui.getByTestId('studio-save'));await waitFor(()=>expect(nav.replace).toHaveBeenCalledWith('NoteDetail',{noteId:importedNoteId(value.id)}));expect(ctx.handleSaveNote).toHaveBeenCalledWith(importedNote(value));
});
test('save failure retains preview and can retry',async()=>{
 ctx.handleSaveNote.mockRejectedValueOnce(Error('disk full'));const ui=mount();await waitFor(()=>expect(ui.getByTestId('studio-save')).toBeTruthy());fireEvent.press(ui.getByTestId('studio-save'));await waitFor(()=>expect(ui.getByText(/저장하지 못했어요/)).toBeTruthy());expect(nav.replace).not.toHaveBeenCalled();fireEvent.press(ui.getByTestId('studio-save'));await waitFor(()=>expect(nav.replace).toHaveBeenCalledTimes(1));
});
test('late response after account A→B→A does not expose the preview',async()=>{
 let finish;readStudioTransfer.mockImplementationOnce(()=>new Promise(r=>{finish=r;}));const ui=mount();ctx={...ctx,userProfile:{authUserId:'B'}};ui.rerender(<StudioImportScreen navigation={nav} route={{params:{code:'a'.repeat(24)}}}/>);ctx={...ctx,userProfile:{authUserId:'A'}};ui.rerender(<StudioImportScreen navigation={nav} route={{params:{code:'a'.repeat(24)}}}/>);await act(async()=>finish(importedNote(value)));expect(ui.queryByTestId('studio-save')).toBeNull();expect(ctx.handleSaveNote).not.toHaveBeenCalled();
});
test('double tap does not issue two saves',async()=>{
 let finish;ctx.handleSaveNote.mockImplementation(()=>new Promise(r=>{finish=r;}));const ui=mount();await waitFor(()=>expect(ui.getByTestId('studio-save')).toBeTruthy());fireEvent.press(ui.getByTestId('studio-save'));fireEvent.press(ui.getByTestId('studio-save'));expect(ctx.handleSaveNote).toHaveBeenCalledTimes(1);await act(async()=>finish(-12));expect(nav.replace).toHaveBeenCalledTimes(1);
});
test('expired code has a recoverable error without saving',async()=>{readStudioTransfer.mockRejectedValue(Error('EXPIRED'));const ui=mount();await waitFor(()=>expect(ui.getByText(/만료되었거나/)).toBeTruthy());expect(ui.queryByTestId('studio-save')).toBeNull();});
