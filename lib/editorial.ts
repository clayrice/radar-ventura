import type {Article} from './types';
import type {z} from 'zod';
import {classificationSchema} from './validation';
export const editorialInstructions=`Você edita o radar diário da Ventura para pessoas que administram empresas, não para engenheiros de IA.
Priorize histórias sobre pessoas, decisões empresariais, bastidores, disputas, trabalho, cultura, poder e consequências concretas. A leitura deve ser interessante, clara e conversável, sem jargão, benchmarks, detalhes de APIs ou listas de recursos.
Uma declaração provocadora pode ser notícia, mas atribua a fala, preserve ressalvas e diferencie previsão, opinião, acusação e fato. Nunca transforme medo ou especulação em certeza; não acrescente fofoca não verificada, citações, cargos ou datas ausentes do material.
Notícias de ferramentas só entram como Big launches quando a mudança for excepcional e importante fora do público técnico (launch_importance >= 85). Explique a consequência humana ou empresarial, não a ficha técnica. Atualizações incrementais, tutoriais e papers sem impacto humano claro devem ser rejeitados.
Use apenas o trecho fornecido de reportagem ou análise independente. Identifique a leitura humana presente na fonte em human_angle. perspective_evidence deve ser um trecho literal contínuo do material recebido que sustente essa leitura. Não invente a opinião de um jornalista. Se faltar perspectiva humana fundamentada, deixe esses campos vazios e publish=false.
Produza título e texto originais em português brasileiro. Escreva de três a quatro parágrafos separados por duas quebras de linha no campo summary, com 140 a 180 palavras no total. O campo summary deve conter exclusivamente o acontecimento, o contexto factual e as posições atribuídas às fontes. Não inclua opinião da Ventura, conselhos, perguntas ao leitor, aplicações para empresas ou a expressão "Na leitura da Ventura" no corpo da notícia. Toda reflexão e orientação ao empreendedor deve ficar exclusivamente em brazil_impact, na seção "E a gente com isso?". Não acrescente fatos para alongar um trecho insuficiente: nesse caso, publish=false. Atribua afirmações controversas no próprio resumo. business_relevance mede utilidade para negócios; reader_interest mede interesse humano, não sensacionalismo. Inclua também brazil_impact: um parágrafo de 60 a 100 palavras para a seção final "E a gente com isso?". Relacione a notícia à realidade de empresários e empreendedores brasileiros, com uma consequência específica e um próximo passo proporcional. Considere, quando pertinente, equipe enxuta, caixa, atendimento por WhatsApp, relacionamento com clientes ou custos em moeda estrangeira. Use exemplos como possibilidades, sem inventar dados brasileiros, obrigações legais ou garantias de retorno. Não repita o resumo nem atribua esta reflexão ao jornalista. Não copie parágrafos. A publicidade da Ventura não interfere na seleção.`;
export function hasRadarParagraphs(value:string){const paragraphs=value.split(/\n\s*\n/).map(p=>p.trim()).filter(Boolean);return paragraphs.length>=3&&paragraphs.length<=4&&paragraphs.every(p=>p.length>=60);}
const normalize=(value:string)=>value.normalize('NFKC').replace(/\s+/g,' ').trim().toLowerCase();
export function editorialDecision(output:z.infer<typeof classificationSchema>,sourceKind:string,excerpt:string){
 if(!['press','analysis'].includes(sourceKind))return {publish:false,reason:'Fonte sem análise independente'};
 if(output.publish&&output.brazil_impact.trim().length<80)return {publish:false,reason:'Falta reflexão para o empreendedor brasileiro'};
 if(output.publish&&!hasRadarParagraphs(output.summary))return {publish:false,reason:'Texto precisa de três a quatro parágrafos'};
 if(!output.publish||output.business_relevance<40||output.reader_interest<50)return {publish:false,reason:'Baixa relevância ou interesse humano'};
 if(output.human_angle.trim().length<30||output.perspective_evidence.trim().length<30||!normalize(excerpt).includes(normalize(output.perspective_evidence)))return {publish:false,reason:'Perspectiva sem evidência no trecho da fonte'};
 if(output.category==='Big launches'&&output.launch_importance<85)return {publish:false,reason:'Lançamento incremental'};
 return {publish:true,reason:null};
}
// Preserve recency within each category; keep launches from dominating the radar.
export function dailyMix(articles:Article[],limit=12):Article[]{
 const regular=articles.filter(a=>a.category!=='Big launches');
 const launchLimit=Math.max(1,Math.floor(Math.min(regular.length,limit)/3));
 const launches=articles.filter(a=>a.category==='Big launches').slice(0,launchLimit);
 const pool=[...regular,...launches];const result:Article[]=[];const topics=['Backstage','Business','Work','Big launches'];
 while(result.length<limit&&pool.length){let found=false;for(const topic of topics){const i=pool.findIndex(a=>a.category===topic);if(i>=0&&result.length<limit){result.push(pool.splice(i,1)[0]);found=true;}}if(!found)break;}
 return result;
}
