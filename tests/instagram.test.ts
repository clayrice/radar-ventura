import test from 'node:test';
import assert from 'node:assert/strict';
import {instagramDraft,instagramPublishAction} from '../lib/instagram-core';
import {demoArticles} from '../lib/demo';
test('legenda mantém dois parágrafos de notícia, reflexão brasileira e fonte',()=>{
 const article={...demoArticles[0],cover_url:'https://cdn.example.com/report.jpg',cover_origin:'article' as const,summary:'Primeiro fato.\n\nSegundo fato.\n\nTerceiro fato.\n\nQuarto fato.',brazil_impact:'Reflexão brasileira.'};
 const draft=instagramDraft(article);
 assert.equal(draft.caption.split('\n\n')[0],'Primeiro fato. Segundo fato.');
 assert.equal(draft.caption.split('\n\n')[1],'Terceiro fato. Quarto fato.');
 assert.ok(draft.caption.includes('E a gente com isso? 🇧🇷\nReflexão brasileira.'));
 assert.ok(draft.caption.endsWith(`Fonte: ${article.source_name}`));
});
test('texto excessivo ou sem reflexão nunca é truncado e publicado',()=>{
 assert.throws(()=>instagramDraft({...demoArticles[0],cover_url:'https://cdn.example.com/report.jpg',cover_origin:'article',summary:'A.\n\nB.',brazil_impact:''}));
 assert.throws(()=>instagramDraft({...demoArticles[0],cover_url:'https://cdn.example.com/report.jpg',cover_origin:'article',summary:'a'.repeat(2200)+'\n\nB.',brazil_impact:'Brasil'}));
 assert.throws(()=>instagramDraft({...demoArticles[0],summary:'A.\n\nB.',brazil_impact:'Brasil'}),/Imagem original/);
});
test('retorno ambíguo de publicação nunca repete media_publish',()=>{
 assert.equal(instagramPublishAction('processing','FINISHED'),'publish');
 assert.equal(instagramPublishAction('publishing','FINISHED'),'review');
 assert.equal(instagramPublishAction('review','FINISHED'),'review');
 assert.equal(instagramPublishAction('publishing','PUBLISHED'),'confirm');
 assert.equal(instagramPublishAction('processing','IN_PROGRESS'),'wait');
 assert.equal(instagramPublishAction('processing','ERROR'),'fail');
});
