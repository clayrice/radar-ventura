import type {Article,DailyEdition} from './types';
export function radarDate(date=new Date()){return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);}
export function formatRadarDate(date:string){return new Intl.DateTimeFormat('pt-BR',{timeZone:'UTC',day:'2-digit',month:'long',year:'numeric'}).format(new Date(`${date}T12:00:00Z`));}
export function groupEditions(articles:Article[]):DailyEdition[]{const groups=new Map<string,Article[]>();for(const article of articles){if(!article.radar_date)continue;const rows=groups.get(article.radar_date)||[];rows.push(article);groups.set(article.radar_date,rows);}return [...groups].sort(([a],[b])=>b.localeCompare(a)).map(([date,rows])=>({date,articles:rows}));}
