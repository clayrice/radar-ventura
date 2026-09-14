import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {hasRadarParagraphs} from '../lib/editorial';
const edition=JSON.parse(readFileSync(new URL('../data/radar/edition.json',import.meta.url),'utf8'));
test('radar real separa notícia e reflexão, com fontes e datas rastreáveis',()=>{
 for(const article of edition.articles){assert.ok(article.summary.split('\n\n').length>=2);assert.equal(new URL(article.source_url).protocol,'https:');assert.ok(Date.parse(article.published_at)<=Date.parse(edition.prepared_at));assert.ok(!article.summary.includes('Na leitura da Ventura')); assert.ok(article.brazil_impact.length>=80);}
 assert.equal(hasRadarParagraphs('Um único parágrafo.'),false);
 assert.equal(hasRadarParagraphs(Array(5).fill('Uma análise com contexto suficiente para entender o impacto desta notícia nas empresas.').join('\n\n')),false);
});
