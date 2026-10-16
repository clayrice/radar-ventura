import type {Edition} from './types';

// Join by article ID, preserving editorial order and analysis-only selections.
export function weeklyStories(e:Edition){
 if(!e.content)return [];
 const content=e.content;
 const ids=[...new Set([...content.overview.map(x=>x.article_id),...content.relevant.map(x=>x.article_id)])];
 return ids.map(id=>{
  const article=e.articles.find(a=>a.id===id);
  if(!article)throw Error('Missing edition article');
  return {article,summary:content.overview.find(x=>x.article_id===id)?.takeaway||article.summary,why:content.relevant.find(x=>x.article_id===id)?.why};
 });
}
