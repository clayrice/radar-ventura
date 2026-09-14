import 'server-only';import {createHmac,timingSafeEqual} from 'node:crypto';
export function unsubscribeToken(userId:string){const secret=process.env.UNSUBSCRIBE_SECRET;if(!secret||secret.length<32)throw new Error('UNSUBSCRIBE_SECRET must contain at least 32 characters');return createHmac('sha256',secret).update(`unsubscribe:${userId}`).digest('hex');}
export function validUnsubscribe(userId:string,token:string){if(!/^[0-9a-f-]{36}$/.test(userId)||!/^[0-9a-f]{64}$/.test(token))return false;return timingSafeEqual(Buffer.from(unsubscribeToken(userId)),Buffer.from(token));}
