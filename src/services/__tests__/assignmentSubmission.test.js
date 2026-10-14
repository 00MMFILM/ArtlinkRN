import {submissionPreview} from '../assignmentSubmission';
test('only explicitly displayed writing and feedback can leave the note',()=>{
  expect(submissionPreview({id:10,title:'Practice',content:'Text',aiComment:'Feedback',videoAnalysis:'Video feedback',transcript:'private',images:[{uri:'private'}],email:'private',aiScores:{voice:99}})).toEqual({noteKey:'10',noteTitle:'Practice',practiceText:'Text',aiFeedback:'Feedback\n\nVideo feedback'});
});
test('media-only, unpersisted or oversized notes cannot silently share truncated data',()=>{
  expect(submissionPreview({id:1,images:[{uri:'local'}]})).toBeNull();
  expect(submissionPreview({content:'unsaved'})).toBeNull();
  expect(submissionPreview({id:1,content:'x'.repeat(12001)})).toBeNull();
  expect(submissionPreview({id:1,aiComment:'x'.repeat(20001)})).toBeNull();
});
