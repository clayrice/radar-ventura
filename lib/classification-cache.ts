import {createHash} from 'node:crypto';
import {classificationSchema} from './validation';
export const CLASSIFICATION_VERSION=2;
export function classificationKey(text:string,sourceKind:string){return createHash('sha256').update(JSON.stringify([CLASSIFICATION_VERSION,text,sourceKind,process.env.OPENAI_MODEL||'gpt-4.1-mini'])).digest('hex');}
export function cachedClassification(cache:unknown,key:string){
 const value=cache as {key?:string;output?:unknown}|null;
 if(value?.key!==key)return null;
 const parsed=classificationSchema.safeParse(value.output);return parsed.success?parsed.data:null;
}
