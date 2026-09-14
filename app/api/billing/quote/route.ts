import {billingEnabled,priceFor} from '@/lib/billing';import {isDemo} from '@/lib/db';
export async function GET(req:Request){const product=new URL(req.url).searchParams.get('product')||'';return Response.json({enabled:billingEnabled()&&!isDemo(),value_cents:priceFor(product),recurring:product!=='roadmap'});}
