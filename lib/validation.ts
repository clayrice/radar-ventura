import {z} from 'zod';
import {sectors,categories,capabilities} from './types';
import {objectives,interestAreas,businessModels,aiLevels} from './profile-options';
export const profileSchema=z.object({
 company:z.string().trim().min(2).max(120),sector:z.enum(sectors),
 size:z.enum(['Solo','2–10','11–50','51–200','200+']),
 objective:z.enum(objectives),business_model:z.enum(businessModels),ai_level:z.enum(aiLevels),
 interests:z.array(z.enum(interestAreas)).min(1).max(3).refine(values=>new Set(values).size===values.length),
 email_opt_in:z.boolean()
});
export const classificationSchema=z.object({
 title:z.string().min(10).max(180),summary:z.string().min(60).max(2400),category:z.enum(categories),
 sectors:z.array(z.enum(sectors)).min(1).max(7),publish:z.boolean(),
 brazil_impact:z.string().max(1000),human_angle:z.string().max(350),perspective_evidence:z.string().max(600),
 business_relevance:z.number().int().min(0).max(100),reader_interest:z.number().int().min(0).max(100),
 launch_importance:z.number().int().min(0).max(100)
});
export const editionSchema=z.object({headline:z.string().min(10).max(150),overview:z.array(z.object({article_id:z.string(),takeaway:z.string().min(15).max(500)})).min(1).max(3),relevant:z.array(z.object({article_id:z.string(),why:z.string().min(20).max(700)})).max(3),actions:z.array(z.object({title:z.string().min(5).max(150),detail:z.string().min(20).max(900),effort:z.string().max(70),capability:z.enum(capabilities)})).min(1).max(3)});
export function safeUrl(input:string):string|null{try{const u=new URL(input);if(u.protocol!=='https:'||u.username||u.password)return null;return u.toString();}catch{return null;}}
export function canonicalUrl(input:string):string|null{const safe=safeUrl(input);if(!safe)return null;const u=new URL(safe);u.hash='';for(const key of [...u.searchParams.keys()])if(key.startsWith('utm_')||['ref','fbclid','gclid'].includes(key))u.searchParams.delete(key);u.searchParams.sort();u.pathname=u.pathname.replace(/\/$/,'')||'/';return u.toString();}
export function weekStart(now=new Date()):string{const d=new Date(now);d.setUTCHours(0,0,0,0);d.setUTCDate(d.getUTCDate()-((d.getUTCDay()+6)%7));return d.toISOString().slice(0,10);}
export function escapeHtml(value:string):string{return value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));}
