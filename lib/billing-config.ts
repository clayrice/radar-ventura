export function billingEnabled(product?:string){
 const products=(process.env.BILLING_PRODUCTS||'').split(',').map(p=>p.trim()).filter(Boolean);
 return process.env.BILLING_ENABLED==='true'&&!!process.env.ASAAS_API_KEY
  &&['sandbox','production'].includes(process.env.ASAAS_ENV||'')
  &&(process.env.ASAAS_WEBHOOK_TOKEN||'').length>=32
  &&!!process.env.APP_URL?.startsWith('https://')
  &&products.length>0&&(!product||products.includes(product));
}
