import test from 'node:test';
import assert from 'node:assert/strict';
import edition from '../data/radar/edition.json';
import {formatRadarDate,groupEditions,radarDate} from '../lib/radar-dates';
import type {Article} from '../lib/types';

test('data editorial respeita o fuso de Brasília',()=>{
 assert.equal(radarDate(new Date('2026-09-23T02:30:00Z')),'2026-09-22');
 assert.equal(radarDate(new Date('2026-09-23T03:30:00Z')),'2026-09-23');
 assert.equal(formatRadarDate('2026-09-21'),'21 de setembro de 2026');
});

test('arquivo agrupa notícias por edição e ordena da mais recente',()=>{
 const base=edition.articles[0] as Article;
 const groups=groupEditions([
  {...base,id:'old',radar_date:'2026-09-21'},
  {...base,id:'new-a',radar_date:'2026-09-23'},
  {...base,id:'new-b',radar_date:'2026-09-23'},
  {...base,id:'missing',radar_date:null}
 ]);
 assert.deepEqual(groups.map(group=>[group.date,group.articles.length]),[['2026-09-23',2],['2026-09-21',1]]);
});
