import 'server-only';
import {showcaseItems} from './partner-showcases';
import {dailyMix} from './editorial';
import edition from '@/data/radar/edition.json';
import {demoPartners} from './demo';
import {isDemo,isEditorialPreview,publicDb,checked} from './db';
import type {Article,Partner} from './types';
export async function articles():Promise<Article[]>{if(isEditorialPreview())return dailyMix(edition.articles); return dailyMix(checked(await publicDb().from('articles').select('id,title,summary,brazil_impact,cover_url,cover_caption,cover_credit,source_name,source_url,published_at,category,sectors,human_angle,perspective_attribution,editorial_score').eq('status','published').order('published_at',{ascending:false}).limit(60)) as Article[]);}
export async function partners():Promise<Partner[]>{if(isDemo())return demoPartners;const db=publicDb();const rows=checked(await db.from('partners').select('*').eq('active',true).order('name')) as Partner[];if(!rows.length)return rows;const showcases=checked(await db.from('partner_showcases').select('user_id,items,updated_at').in('user_id',rows.map(p=>p.owner_id).filter((id):id is string=>!!id)))||[];return rows.map(p=>{const showcase=showcases.find(s=>s.user_id===p.owner_id);return {...p,media:showcase?showcaseItems(showcase.items,showcase.updated_at):[]};});}
