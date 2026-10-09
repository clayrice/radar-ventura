import type {Article} from './types';
import type {z} from 'zod';
import {classificationSchema} from './validation';
export const editorialInstructions=`Você edita o radar diário da Ventura para empresários e empreendedores brasileiros. Escreva com clareza, sem jargão técnico e sem publicidade disfarçada.
Abra a seleção para notícias, lançamentos úteis, casos reais, guias práticos e comparações. A edição busca três publicações e diversidade entre entender o que aconteceu, ver onde funciona e aprender como aproveitar. Essa composição é flexível: não force uma categoria quando as fontes do dia não a sustentarem.
Use Business para acontecimentos empresariais; Work para trabalho e cotidiano; Backstage para pessoas, disputas e debates; Big launches para lançamentos e atualizações com utilidade empresarial; Guides para tutoriais e explicações práticas; Cases para experiências documentadas de empresas; Comparisons para avaliações comparativas fundamentadas. Não transforme um anúncio em caso comprovado nem uma lista promocional em comparação.
Lançamentos não precisam ser excepcionais: considere mudança de preço, acesso no Brasil, facilidade de uso e capacidade útil para uma tarefa ou decisão. launch_importance mede a magnitude, mas não determina sozinho a publicação. Explique o que está realmente disponível e diferencie anúncio, demonstração e resultado observado. Detalhes de APIs, benchmarks isolados e papers sem aplicação compreensível têm baixa prioridade.
Dê espaço a marketing, divulgação, vendas, atendimento, imagens, documentos, análise de dados, decisões, conhecimento da equipe e novas ofertas. Guias devem resolver uma tarefa específica com passos sustentados pela fonte, requisitos e limites. Comparações precisam de critérios e evidências, sem declarar um vencedor universal. Casos reais devem preservar contexto, limitações e atribuição dos resultados, sem prometer que outra empresa terá o mesmo retorno.
Bastidores e debates continuam elegíveis. Diferencie opinião, previsão, acusação e fato, atribuindo declarações e preservando ressalvas. Não acrescente fofoca não verificada.
Use apenas o material recebido de reportagem, análise ou curadoria independente. human_angle identifica a perspectiva humana, o problema prático ou a decisão empresarial sustentada pela fonte. perspective_evidence deve ser um trecho literal contínuo que sustente essa leitura, o método ou a experiência documentada. Não é obrigatório haver uma opinião pessoal do jornalista. Se o trecho não sustentar um texto seguro, publish=false.
Produza título original em português brasileiro. Em Guides, comece com "Guia:"; em Comparisons, com "Comparação:"; em Cases, com "Caso real:". Isso distingue conteúdos educativos de acontecimentos. Escreva de três a quatro parágrafos separados por duas quebras de linha em summary, com 140 a 180 palavras. Nas notícias, apresente exclusivamente acontecimento, contexto e posições atribuídas. Nos guias, apresente a tarefa, o método e limites descritos pela fonte; nas comparações, critérios e resultados; nos casos, experiência e evidência. Não inclua opinião ou recomendações da Ventura em summary. Não invente passos, preços, resultados, recursos, disponibilidade ou datas para completar o texto. business_relevance mede utilidade para negócios; reader_interest mede curiosidade ou vontade de aprender, sem sensacionalismo.
brazil_impact contém exclusivamente a reflexão Ventura: 60 a 100 palavras, com consequência específica para o empreendedor brasileiro e um próximo passo proporcional. Considere equipe enxuta, orçamento, clientes e custos quando pertinente. Diferencie possibilidades de resultados comprovados. Não invente dados brasileiros nem obrigações legais. Toda orientação da Ventura fica na seção final "E a gente com isso?", separada do texto da fonte. Parceiros patrocinados nunca influenciam a seleção.`;
export function normalizeRadarSummary(value:string){
 const lines=value.replace(/\r/g,'').split(/\n+/).map(p=>p.trim()).filter(Boolean);
 if(lines.length>=3&&lines.length<=4&&lines.every(p=>p.length>=30))return lines.join('\n\n');
 const source=lines.join(' ')||value;
 const rawSentences=(source.replace(/\s+/g,' ').trim().match(/[^.!?]+(?:[.!?]+(?=\s|$)|$)/g)||[]).map(s=>s.trim()).filter(Boolean);
 const sentences:string[]=[];
 for(let index=0;index<rawSentences.length;index++){
  const sentence=rawSentences[index];
  if(sentence.length<30&&sentences.length){sentences[sentences.length-1]+=` ${sentence}`;continue;}
  if(sentence.length<30&&index+1<rawSentences.length){sentences.push(`${sentence} ${rawSentences[++index]}`);continue;}
  sentences.push(sentence);
 }
 if(sentences.length<3)return value.trim();
 const paragraphs=Math.min(4,Math.max(3,Math.ceil(sentences.length/2)));
 const base=Math.floor(sentences.length/paragraphs),extra=sentences.length%paragraphs;let offset=0;
 return Array.from({length:paragraphs},(_,index)=>{const end=offset+base+(index<extra?1:0);const paragraph=sentences.slice(offset,end).join(' ');offset=end;return paragraph;}).join('\n\n');
}
export function hasRadarParagraphs(value:string){
 const paragraphs=value.split(/\n\s*\n/).map(p=>p.trim()).filter(Boolean);
 return paragraphs.length>=3&&paragraphs.length<=4&&paragraphs.every(p=>p.length>=30);
}
const normalize=(value:string)=>value.normalize('NFKC').replace(/\s+/g,' ').trim().toLowerCase();
function editorialRequirement(output:z.infer<typeof classificationSchema>,sourceKind:string,excerpt:string){
 if(!['press','analysis'].includes(sourceKind))return {publish:false,reason:'Fonte sem análise independente'};
 if(output.brazil_impact.trim().length<80)return {publish:false,reason:'Falta reflexão para o empreendedor brasileiro'};
 if(!hasRadarParagraphs(output.summary))return {publish:false,reason:'Texto precisa de três a quatro parágrafos'};
 if(output.human_angle.trim().length<30||output.perspective_evidence.trim().length<30||!normalize(excerpt).includes(normalize(output.perspective_evidence)))return {publish:false,reason:'Perspectiva sem evidência no trecho da fonte'};
 return null;
}
export function editorialDecision(output:z.infer<typeof classificationSchema>,sourceKind:string,excerpt:string){
 const required=editorialRequirement(output,sourceKind,excerpt);if(required)return required;
 if(!output.publish||output.business_relevance<40||Math.max(output.reader_interest,output.business_relevance)<50)return {publish:false,reason:'Baixa relevância ou interesse humano'};
 return {publish:true,reason:null};
}
// All selection paths share the same requirements; quota completion cannot bypass rejection.
export const editorialFallbackDecision=editorialDecision;
export const editorialCompletionDecision=editorialDecision;
export function selectDailyCandidates<T extends {source_id:string;published_at:string}>(articles:T[],limit=10){
 const selected:T[]=[];const perSource=new Map<string,number>();
 for(const article of articles){const count=perSource.get(article.source_id)||0;if(count>=2)continue;selected.push(article);perSource.set(article.source_id,count+1);if(selected.length>=limit)break;}
 return selected;
}
// Preserve recency within each category; keep launches from dominating the radar.
export function dailyMix(articles:Article[],limit=12):Article[]{
 const regular=articles.filter(a=>a.category!=='Big launches');
 const launchLimit=Math.max(1,Math.floor(Math.min(regular.length,limit)/3));
 const launches=articles.filter(a=>a.category==='Big launches').slice(0,launchLimit);
 const pool=[...regular,...launches];const result:Article[]=[];const topics=['Business','Backstage','Big launches','Cases','Guides','Comparisons','Work'];
 for(const bucket of [['Business','Backstage','Work','Big launches'],['Cases'],['Guides','Comparisons']]){const i=pool.findIndex(a=>bucket.includes(a.category));if(i>=0&&result.length<limit)result.push(pool.splice(i,1)[0]);}
 while(result.length<limit&&pool.length){let found=false;for(const topic of topics){const i=pool.findIndex(a=>a.category===topic);if(i>=0&&result.length<limit){result.push(pool.splice(i,1)[0]);found=true;}}if(!found)break;}
 const minimum=Math.min(3,limit,articles.length);for(const article of articles){if(result.length>=minimum)break;if(!result.some(item=>item.id===article.id))result.push(article);}
 return result;
}
