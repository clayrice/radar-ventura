import {classificationSchema} from './validation';
export const newsClassificationSchema=classificationSchema.extend({evidence_index:classificationSchema.shape.business_relevance});
export function evidencePassages(text:string){
 const passages:string[]=[];let current='';
 for(const word of text.replace(/\s+/g,' ').trim().split(' ')){
  if(current.length+word.length+1>450){if(current.length>=30)passages.push(current);current='';}
  current+=(current?' ':'')+word;
 }
 if(current.length>=30)passages.push(current);
 return passages.slice(0,100).map((text,index)=>({index,text}));
}
export function resolveEvidence<T extends {perspective_evidence:string;evidence_index:number}>(output:T,passages:{index:number;text:string}[]){
 const selected=passages.find(p=>p.index===output.evidence_index);
 // An invalid identifier must fail the same evidence gate, never invent a passage.
 return {...output,perspective_evidence:selected?.text||''};
}
