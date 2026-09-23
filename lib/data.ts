import 'server-only';
import {showcaseItems} from './partner-showcases';
import {dailyMix} from './editorial';
import edition from '@/data/radar/edition.json';
import {demoPartners} from './demo';
import {isDemo,isEditorialPreview,publicDb,checked} from './db';
import {groupEditions,radarDate} from './radar-dates';
import type {Article,DailyEdition,Partner} from './types';
const articleColumns='id,title,summary,brazil_impact,cover_url,cover_caption,cover_credit,radar_date,source_name,source_url,published_at,category,sectors,human_angle,perspective_attribution,editorial_score';
export async function articles():Promise<Article[]>{const today=radarDate();if(isEditorialPreview())return edition.edition_date===today?dailyMix(edition.articles as Article[]):[];return dailyMix(checked(await publicDb().from('articles').select(articleColumns).eq('status','published').eq('radar_date',today).order('editorial_score',{ascending:false}).order('published_at',{ascending:false}).limit(12)) as unknown as Article[]);}
export async function archiveEditions():Promise<DailyEdition[]>{const today=radarDate();const rows=isDemo()?[]:checked(await publicDb().from('articles').select(articleColumns).eq('status','published').lt('radar_date',today).order('radar_date',{ascending:false}).order('editorial_score',{ascending:false}).limit(240)) as unknown as Article[];const groups=groupEditions(rows);if(edition.edition_date<today&&!groups.some(group=>group.date===edition.edition_date))groups.push({date:edition.edition_date,articles:dailyMix(edition.articles as Article[])});return groups.sort((a,b)=>b.date.localeCompare(a.date));}
export async function partners():Promise<Partner[]>{if(isDemo())return demoPartners;const db=publicDb();const rows=checked(await db.from('partners').select('*').eq('active',true).order('name')) as Partner[];if(!rows.length)return rows;const showcases=checked(await db.from('partner_showcases').select('user_id,items,updated_at').in('user_id',rows.map(p=>p.owner_id).filter((id):id is string=>!!id)))||[];return rows.map(p=>{const showcase=showcases.find(s=>s.user_id===p.owner_id);return {...p,media:showcase?showcaseItems(showcase.items,showcase.updated_at):[]};});}
