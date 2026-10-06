export const DAILY_TARGET = 3;
export const SEARCH_STAGES = [
 {days:1,items:15}, {days:3,items:30}, {days:7,items:60}, {days:14,items:100},
] as const;
export function editionOutcome(portal:number,instagram:number,reason='awaiting_publication') {
 if(portal>DAILY_TARGET||instagram>DAILY_TARGET)return {status:'blocked',reason:'publication_count_exceeded'};
 if(portal===DAILY_TARGET&&instagram===DAILY_TARGET)return {status:'completed',reason:'three_articles_and_posts_confirmed'};
 return {status:'pending',reason};
}
export function retryDelay(attempt:number){return Math.min(300000,15000*2**Math.max(0,attempt-1));}
export class NewsBudgetError extends Error {constructor(){super('news_daily_budget_exhausted');}}
