import 'server-only';
import {adminDb,checked} from './db';
import {emailFingerprint} from './email-feedback-core';
export class EmailSuppressedError extends Error{constructor(){super('Recipient blocked after permanent bounce or spam complaint');this.name='EmailSuppressedError';}}
export async function assertEmailAllowed(payload:Record<string,unknown>){
 if(!Array.isArray(payload.to)||payload.to.length!==1||typeof payload.to[0]!=='string'||payload.cc||payload.bcc)throw Error('Invalid email recipient');
 const fingerprint=emailFingerprint(payload.to[0]);
 const blocked=checked(await adminDb().from('email_suppressions').select('fingerprint').eq('fingerprint',fingerprint).maybeSingle());
 if(blocked)throw new EmailSuppressedError();
}
