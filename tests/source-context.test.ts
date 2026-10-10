import test from 'node:test';
import assert from 'node:assert/strict';
import {extractArticleText,sourceContext} from '../lib/source-context';
import {cachedClassification,classificationKey} from '../lib/classification-cache';
import {editorialDecision,editorialInstructions} from '../lib/editorial';
const paragraph='An independent report describes how a small business evaluated artificial intelligence for its customer service team, measured the results and kept human review for complex requests.';
const html=`<html><head><meta property="og:image" content="https://cdn.example.com/photo.jpg"></head><body><nav><p>Navigation advertising</p></nav><article><p>${paragraph}</p><p>${paragraph} The project took place over several weeks.</p><p>${paragraph} Staff compared responses and recorded errors.</p><p>${paragraph} The company has not expanded the test yet.</p><aside><p>Sign up for our newsletter</p></aside></article></body></html>`;
test('extrai reportagem e capa, excluindo menus e chamadas de assinatura',async()=>{
 const text=extractArticleText(html);assert.ok(text.includes(paragraph));assert.ok(!text.includes('newsletter'));assert.ok(!text.includes('Navigation'));
 const result=await sourceContext('https://news.example.com/a',['news.example.com'],async()=>new Response(html,{headers:{'content-type':'text/html'}}));
 assert.equal(result.text,text);assert.equal((result as any).cover_url,'https://cdn.example.com/photo.jpg');
 assert.equal(extractArticleText('<article><p>Only a short teaser.</p></article>'),'');
});
test('redirecionamento fora da origem é recusado antes de qualquer acesso ao destino',async()=>{
 const calls:string[]=[];const result=await sourceContext('https://news.example.com/a',['news.example.com'],async(input)=>{calls.push(String(input));return new Response(null,{status:302,headers:{location:'https://127.0.0.1/private'}});});
 assert.equal(calls.length,1);assert.equal(result.text,'');
});
const output={title:'Uma notícia sobre atendimento',summary:Array.from({length:3},()=> 'A reportagem descreve a avaliação da ferramenta, os resultados observados e as limitações identificadas pela equipe.').join('\n\n'),category:'Work' as const,sectors:['Retail' as const],publish:true,brazil_impact:'O empreendedor brasileiro pode avaliar uma tarefa com a equipe e medir os erros antes de ampliar o uso.',human_angle:'A equipe avaliou o resultado e manteve revisão humana para pedidos complexos.',perspective_evidence:paragraph,business_relevance:80,reader_interest:80,launch_importance:0};
test('citação em inglês passa na fonte inglesa; tradução continua sendo recusada',()=>{
 assert.equal(editorialDecision(output,'press',extractArticleText(html)).publish,true);
 assert.equal(editorialDecision({...output,perspective_evidence:'Uma reportagem independente descreve como uma pequena empresa avaliou inteligência artificial.'},'press',extractArticleText(html)).publish,false);
 assert.ok(editorialInstructions.includes('sem tradução'));
});
test('cache reutiliza resultado válido e invalida quando o texto ou a origem mudam',()=>{
 const key=classificationKey(paragraph,'press');assert.deepEqual(cachedClassification({key,output},key),output);
 assert.equal(cachedClassification({key,output},classificationKey(paragraph+' extra','press')),null);
 assert.equal(cachedClassification({key,output},classificationKey(paragraph,'primary')),null);
 assert.equal(cachedClassification({key,output:{publish:true}},key),null);
});
