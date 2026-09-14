const destinations = new Set(['/account','/account/profile','/account/parceiro','/account/rota','/account/pagamento']);
export function authDestination(value:unknown):string {
 return typeof value==='string' && destinations.has(value) ? value : '/account';
}
export function loginPath(next:unknown,error?:string):string {
 const params=new URLSearchParams({next:authDestination(next)});
 if(error)params.set('error',error);
 return `/login?${params}`;
}
export function authCallbackUrl(origin:string,next:unknown):string {
 const url=new URL('/auth/confirm',origin);
 url.searchParams.set('next',authDestination(next));
 return url.toString();
}
