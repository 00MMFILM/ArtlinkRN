import { findFeedbackToReview } from '../nextPractice';
const now = Date.parse('2026-09-28T12:00:00Z');
const note = (patch = {}) => ({id:'one', createdAt:new Date(now - 1000).toISOString(), aiComment:'A useful observation', focusOptions:['Listen first'], ...patch});
test('offers the newest feedback from an uncontinued take', () => {
  expect(findFeedbackToReview([note(), note({id:'new', createdAt:new Date(now).toISOString()})], now).id).toBe('new');
});
test('does not resurrect check-ins, stale, future or already continued notes', () => {
  expect(findFeedbackToReview([
    note({type:'checkin',id:'checkin'}), note({id:'old', createdAt:new Date(now - 15 * 86400000).toISOString()}),
    note({id:'future', createdAt:new Date(now + 1000).toISOString()}), note(),
    note({id:'child',parentNoteId:'one',aiComment:''}), note({id:'selected',chosenFocus:'Listen first'}),
    null, {id:'invalid',aiComment:'Feedback',createdAt:'bad date'},
  ], now)).toBeNull();
});
test('supports video-only feedback, excludes empty feedback and invalid input', () => {
  expect(findFeedbackToReview([note({aiComment:' ', videoAnalysis:'Look at the frame'})], now).id).toBe('one');
  expect(findFeedbackToReview([note({aiComment:' '})], now)).toBeNull();
  expect(findFeedbackToReview([note({focusOptions:undefined})], now)).toBeNull();
  expect(findFeedbackToReview([note({focusOptions:[]})], now)).toBeNull();
  expect(findFeedbackToReview(null, now)).toBeNull();
});
