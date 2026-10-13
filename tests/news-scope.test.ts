import test from 'node:test';
import assert from 'node:assert/strict';
import {cachedNewsScope,newsScopeDecision} from '../lib/news-scope';
import {editorialDecision,editorialCompletionDecision,editorialFallbackDecision} from '../lib/editorial';
import {classificationKey} from '../lib/classification-cache';

const scope={ai_is_central:true,business_value:'clear',business_reason:'A capacidade descrita permite comparar custos e revisar documentos da empresa.',ai_evidence_index:0,business_evidence_index:0};
const summary='A fonte apresenta o acontecimento e suas condições de acesso, com exemplos e limitações verificáveis.';
const output={title:'ChatGPT ganha uma nova ferramenta para empresas',summary:[summary,summary,summary].join('\n\n'),category:'Big launches' as const,sectors:['Other' as const],publish:true,brazil_impact:'Uma justificativa genérica que menciona oportunidades para empresas brasileiras e propõe ampliar o engajamento de clientes.',human_angle:'Uma leitura empresarial inventada para tentar justificar a publicação.',perspective_evidence:'',business_relevance:100,reader_interest:100,launch_importance:100};

test('surto de sarampo e jogo para iPhone são bloqueados mesmo com notas máximas e título de LLM',()=>{
 const sources=[
  'A 39-year-old unvaccinated woman became the sixth measles death in Pennsylvania. The state reported 1,136 cases and 218 hospitalizations.',
  "No Man's Sky is coming to iPhone and iPad. Its procedural generation creates galaxies on device. It supports touch controls and will cost $19.99."
 ];
 for(const text of sources){
  const generated={...output,perspective_evidence:text};
  for(const decision of [editorialDecision,editorialCompletionDecision,editorialFallbackDecision])assert.equal(decision(generated,'press',text).publish,false);
  assert.equal(newsScopeDecision(scope,text).publish,false);
 }
});
test('menção incidental a IA e interesse genérico em negócios não bastam',()=>{
 const text='A game is launching on iPhone. Its creator also discussed AI in an unrelated interview. The launch adds touch controls and has no new AI functionality.';
 assert.equal(newsScopeDecision({...scope,ai_is_central:false},text).publish,false);
 const paper='An AI research paper reports a higher benchmark score without identifying an application, availability, price or a business consequence.';
 assert.equal(newsScopeDecision({...scope,business_value:'weak'},paper).publish,false);
 assert.equal(newsScopeDecision({...scope,business_value:'none'},paper).publish,false);
 assert.equal(newsScopeDecision({...scope,business_reason:'Oportunidade para empresas'},paper).publish,false);
});
test('novas capacidades úteis do ChatGPT e Claude, casos e decisões sobre IA seguem elegíveis',()=>{
 for(const text of [
  'ChatGPT now generates interactive cost calculators and charts, with controls for adjusting the assumptions used in a comparison.',
  'Claude adds a document tool that compares supplier proposals and extracts the conditions of service for review by the business owner.',
  'A retailer used artificial intelligence to classify support requests and measured errors before expanding the pilot to other customer service teams.',
  'An AI provider changed its prices and access rules. Businesses using its assistant must review the cost of their existing subscription.'
 ])assert.equal(newsScopeDecision(scope,text).publish,true);
});
test('evidência inválida e cache sem avaliação independente impedem aprovação',()=>{
 const text='ChatGPT adds an interactive calculator that allows a business to compare supplier costs by adjusting volumes and prices.';
 assert.equal(newsScopeDecision(null,text).publish,false);
 assert.equal(newsScopeDecision({...scope,ai_evidence_index:99},text).publish,false);
 assert.equal(newsScopeDecision({...scope,business_evidence_index:99},text).publish,false);
 const key=classificationKey(text,'press');
 assert.equal(cachedNewsScope({key,output},key),null);
 assert.equal(cachedNewsScope({key,scope},classificationKey(text+' changed','press')),null);
 assert.deepEqual(cachedNewsScope({key,scope},key),scope);
});
