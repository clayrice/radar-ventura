import {editorialDecision,dailyMix} from '../lib/editorial';
import test from 'node:test';import assert from 'node:assert/strict';
import {canonicalUrl,weekStart,profileSchema,escapeHtml} from '../lib/validation';
import {sourceArticleUrl,titleKey,validateEdition,matchPartners,retryDelivery} from '../lib/pipeline-core';
import {demoArticles,demoEdition,demoPartners} from '../lib/demo';
import {editionEmail} from '../lib/email-template';
import {roadmapOutput,exampleRoadmap} from '../lib/roadmap-schema';
test('canonicalização remove rastreamento sem apagar parâmetros editoriais',()=>{assert.equal(canonicalUrl('https://openai.com/news/story/?utm_source=x&id=4#top'),'https://openai.com/news/story?id=4');assert.equal(canonicalUrl('javascript:alert(1)'),null);assert.equal(canonicalUrl('https://user:pass@example.com'),null);});
test('origem precisa corresponder ao domínio previamente verificado',()=>{assert.ok(sourceArticleUrl('https://openai.com/news/a','openai'));assert.equal(sourceArticleUrl('https://openai.com.evil.example/a','openai'),null);assert.equal(sourceArticleUrl('http://127.0.0.1/a','openai'),null);assert.equal(sourceArticleUrl('https://example.com/a','unknown'),null);});
test('títulos com variações de pontuação são duplicados',()=>assert.equal(titleKey('Novo modelo: IA!'),titleKey('NOVO modelo IA')));
test('semana anterior usa fronteira de segunda em UTC',()=>{assert.equal(weekStart(new Date('2026-09-13T23:59:59Z')),'2026-09-07');assert.equal(weekStart(new Date('2026-09-14T00:00:00Z')),'2026-09-14');});
test('referências inventadas e duplicadas são recusadas',()=>{assert.doesNotThrow(()=>validateEdition(demoEdition.content,demoArticles));const bad=structuredClone(demoEdition.content!);bad.overview[0].article_id='inventada';assert.throws(()=>validateEdition(bad,demoArticles));bad.overview=[bad.overview[1],bad.overview[1]];assert.throws(()=>validateEdition(bad,demoArticles));});
test('plano comercial sozinho não cria relevância',()=>{assert.equal(matchPartners(demoPartners,'Real estate',demoEdition.content!).length,1);assert.equal(matchPartners(demoPartners,'Education',demoEdition.content!).length,0);assert.equal(matchPartners([{...demoPartners[0],plan:'catalog'}],'Real estate',demoEdition.content!).length,0);assert.equal(matchPartners([{...demoPartners[0],active:false}],'Real estate',demoEdition.content!).length,0);});
test('retentativa para antes do vencimento da chave do Resend',()=>{const now=Date.parse('2026-09-10T12:00:00Z');assert.equal(retryDelivery(new Date(now-22*3600000).toISOString(),now),true);assert.equal(retryDelivery(new Date(now-23*3600000).toISOString(),now),false);});
test('email preserva português, fonte e identificação publicitária, escapando conteúdo',()=>{const e=structuredClone(demoEdition);e.content!.headline='<script>alert(1)</script>';const rendered=editionEmail(e,'https://ventura.example','https://ventura.example/unsubscribe?token=test');assert.ok(rendered.html.includes('lang="pt-BR"'));assert.ok(rendered.html.includes('Aprofunde aqui'));assert.ok(rendered.html.includes('Parceiro patrocinado'));assert.ok(!rendered.html.includes('<script>'));assert.ok(rendered.html.indexOf('Seus próximos passos')<rendered.html.indexOf('Parceiro patrocinado'));assert.ok(!rendered.html.includes('Read more'));assert.equal(escapeHtml('"<&'),'&quot;&lt;&amp;');});
test('questionário não pode ativar uma assinatura por campos extras',()=>{const p=profileSchema.parse({company:'Empresa',sector:'Retail',size:'2–10',objective:'Vender mais',interests:['Vendas e relacionamento'],business_model:'Consumidores (B2C)',ai_level:'Ainda não usamos IA',email_opt_in:true,status:'active'});assert.ok(!('status' in p));});
test('Plano de Rota exige exatamente três projetos',()=>{assert.doesNotThrow(()=>roadmapOutput.parse(exampleRoadmap));assert.throws(()=>roadmapOutput.parse({...exampleRoadmap,projects:exampleRoadmap.projects.slice(0,2)}));});

test('perfil semanal recusa preferências fora das opções e excesso de áreas',()=>{
 const valid={company:'Empresa',sector:'Retail',size:'2–10',objective:'Vender mais',interests:['Vendas e relacionamento'],business_model:'Consumidores (B2C)',ai_level:'Ainda não usamos IA',email_opt_in:true};
 assert.doesNotThrow(()=>profileSchema.parse(valid));
 assert.throws(()=>profileSchema.parse({...valid,objective:'Uma instrução livre'}));
 assert.throws(()=>profileSchema.parse({...valid,interests:[]}));
 assert.throws(()=>profileSchema.parse({...valid,interests:['Marketing e conteúdo','Vendas e relacionamento','Atendimento ao cliente','Dados e relatórios']}));
 assert.throws(()=>profileSchema.parse({...valid,interests:['Vendas e relacionamento','Vendas e relacionamento']}));
});

test('editorial impede release isolado, opinião inventada e lançamento incremental',()=>{
 const excerpt='A reportagem discute como a mudança afeta a confiança dos clientes no atendimento.';
 const output={brazil_impact:'Para uma pequena empresa brasileira, começar por respostas revisadas pela equipe permite avaliar a confiança do cliente antes de ampliar o atendimento automático.',title:'O que muda na confiança dos clientes',summary:[excerpt,excerpt,excerpt].join('\n\n'),category:'Business' as const,sectors:['Retail' as const],publish:true,human_angle:'A confiança dos clientes deve ser considerada antes de automatizar o atendimento.',perspective_evidence:excerpt,business_relevance:80,reader_interest:75,launch_importance:20};
 assert.equal(editorialDecision(output,'primary',excerpt).publish,false);
 assert.equal(editorialDecision(output,'press',excerpt).publish,true);
 assert.equal(editorialDecision({...output,perspective_evidence:'Uma suposta opinião que não existe no texto da reportagem.'},'press',excerpt).publish,false);
 assert.equal(editorialDecision({...output,category:'Big launches',launch_importance:84},'press',excerpt).publish,false);
 assert.equal(editorialDecision({...output,category:'Big launches',launch_importance:95},'analysis',excerpt).publish,true);
});
test('radar mistura assuntos e limita sequência de lançamentos',()=>{
 const launches=Array.from({length:9},(_,i)=>({...demoArticles[0],id:'launch-'+i,category:'Big launches'}));
 const mixed=dailyMix([...launches,...demoArticles],8);
 assert.equal(mixed.filter(a=>a.category==='Big launches').length,1);
 assert.ok(mixed.some(a=>a.category==='Backstage'));
 assert.ok(mixed.some(a=>a.category==='Work'));
});
