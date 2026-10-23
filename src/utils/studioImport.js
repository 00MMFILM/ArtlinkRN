import { normalize, describe } from './studioTransferContract';

export function webReviewMetadata(source) {
  const value=source?.webReview;
  if(!value || !/^[a-f0-9]{64}$/.test(value.id))return {};
  try{return {webReview:{id:value.id,review:normalize(value.review)}};}catch{return {};}
}
export function importedNote(value) {
  const meta=webReviewMetadata({webReview:value});
  if(!meta.webReview)throw Error('INVALID_REVIEW');
  const p=meta.webReview.review;
  return {...meta,title:p.title,field:p.field,
    content:p.field==='literature'?p.texts.b:describe(p),
    workReviewNotes:p.notes.map((n,i)=>({...n,id:`web-${i}`})),
  };
}

// Existing user_notes.local_id is BIGINT. Negative safe integers avoid timestamp IDs.
export function importedNoteId(id) {
  if (typeof id !== 'string' || !/^[a-f0-9]{64}$/.test(id)) return null;
  return -parseInt(id.slice(0,13),16)-1;
}
