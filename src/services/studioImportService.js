import { code } from '../utils/studioTransferContract';
import { importedNote } from '../utils/studioImport';
export async function readStudioTransfer(input,{signal}={}) {
  const value=code(input);if(!value)throw Error('INVALID_CODE');
  const controller=new AbortController(),cancel=()=>controller.abort();
  if(signal?.aborted)controller.abort();else signal?.addEventListener('abort',cancel);
  const timer=setTimeout(cancel,20000);
  try{
    const response=await fetch('https://art-link.kr/api/studio-transfer',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'read',code:value}),signal:controller.signal});
    const data=await response.json();if(!response.ok)throw Error(data.error||'UNAVAILABLE');
    if(!Number.isFinite(data.expiresAt)||data.expiresAt<=Date.now())throw Error('EXPIRED');
    return importedNote({id:data.id,review:data.review});
  }finally{clearTimeout(timer);signal?.removeEventListener('abort',cancel);}
}
