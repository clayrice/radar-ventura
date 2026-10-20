type VerifiedUser={email?:string|null;email_confirmed_at?:string|null};
export function operationsAllowed(user:VerifiedUser|null|undefined,allowlist=process.env.OPS_ADMIN_EMAILS||''){
 if(!user?.email||!user.email_confirmed_at)return false;
 const entries=allowlist.split(',').map(s=>s.trim().toLowerCase()).filter(Boolean);
 return entries.length>0&&entries.includes(user.email.trim().toLowerCase());
}
