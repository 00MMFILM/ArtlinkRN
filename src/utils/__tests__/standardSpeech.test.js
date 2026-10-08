import { buildRepracticePrefill } from "../repractice";
jest.mock("@react-native-async-storage/async-storage", () => require("@react-native-async-storage/async-storage/jest/async-storage-mock"));
import { practicePrefill, speechLines } from '../standardSpeech';
import { sanitizeStudioMetadata, studioFeedbackContext } from '../studioMetadata';
import { buildDraft } from '../../services/noteDraft';
test('ACT RAW stable id and explicit supported mode are both required', () => {
 const query={source:'actraw',m:'one',mode:'standard_speech',content:'원본 대사',title:'독백'};
 expect(practicePrefill(query)).toMatchObject({sceneId:'actraw:one',practiceMode:'standard_speech',content:'원본 대사',field:'acting'});
 for (const changes of [{source:'other'},{m:'../x'},{mode:'score'},{mode:['standard_speech']}]) expect(practicePrefill({...query,...changes}).practiceMode).toBeUndefined();
});
test('draft keeps mode and selected line without rewriting the script or recording', () => {
 const note={...practicePrefill({source:'actraw',m:'one',mode:'standard_speech',content:'원문\n다음 줄'}),speechLineIndex:1,voiceRecordings:[{uri:'file:///a'}]};
 expect(buildDraft(note)).toMatchObject({practiceMode:'standard_speech',speechLineIndex:1,content:'원문\n다음 줄',voiceRecordings:note.voiceRecordings});
 expect(sanitizeStudioMetadata(note)).toEqual({practiceMode:'standard_speech',speechLineIndex:1});
 expect(studioFeedbackContext(note)).toContain('A transcript is not acoustic evidence');
});
test('invalid metadata is dropped and blank script produces no made-up lines', () => {
 expect(sanitizeStudioMetadata({practiceMode:'score',speechLineIndex:99})).toEqual({});
 expect(speechLines(' \n')).toEqual([]);
 expect(speechLines('  첫 줄\n\n다음 줄  ')).toEqual(['첫 줄','다음 줄']);
});

test("standard speech retry preserves script without previous media or AI output", () => {
 const next = buildRepracticePrefill({id:1,practiceMode:"standard_speech",content:"내 대사",speechLineIndex:1,voiceRecordings:[{uri:"old"}],aiComment:"old"});
 expect(next).toMatchObject({content:"내 대사",practiceMode:"standard_speech",speechLineIndex:1});
 expect(next.voiceRecordings).toBeUndefined(); expect(next.aiComment).toBeUndefined();
 expect(buildRepracticePrefill({id:1,content:"other"}).content).toBeUndefined();
});
