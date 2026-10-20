import {createHmac} from 'node:crypto';
import {isIP} from 'node:net';
export function signupRateKey(headers:Pick<Headers,'get'>,secret=process.env.UNSUBSCRIBE_SECRET||'',proxy=process.env.SIGNUP_TRUSTED_PROXY||'',now=new Date()){
 if(proxy!=='netlify'||secret.length<32)return null;
 // Trust only the explicitly configured platform header, never X-Forwarded-For.
 const ip=headers.get('x-nf-client-connection-ip')?.trim();
 if(!ip||!isIP(ip))return null;
 const canonical=ip.includes(':')?new URL(`http://[${ip}]/`).hostname:ip;
 return createHmac('sha256',secret).update(`daily-signup/${now.toISOString().slice(0,10)}/${canonical}`).digest('hex');
}
