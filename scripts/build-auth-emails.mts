import {mkdir,writeFile} from 'node:fs/promises';
import {emailButton,emailFrame} from '../lib/radar-design';

// Supabase supplies these two trusted template values when sending the message.
const origin='https://radar.example';
const link=`${origin}/auth-email-link`;
const templates=[
 {file:'magic-link.html',subject:'Seu acesso ao Radar Ventura',title:'Seu acesso ao Radar Ventura.',intro:'Use o botão abaixo para acessar sua conta, personalizar sua edição semanal e consultar seu histórico.',button:'Acessar minha conta'},
 {file:'confirm-sign-up.html',subject:'Confirme sua conta no Radar Ventura',title:'Confirme sua conta.',intro:'Confirme seu endereço de e-mail para acessar o Radar Ventura e personalizar sua edição semanal. Criar a conta não ativa uma assinatura nem gera cobrança.',button:'Confirmar e acessar'},
];
const directory=new URL('../supabase/templates/',import.meta.url);
await mkdir(directory,{recursive:true});
for(const t of templates){
 const body=`<p style="margin:0 0 12px;color:#524FF5;font:12px/18px Arial,sans-serif;letter-spacing:1px">SUA CONTA VENTURA</p><h1 style="margin:0 0 20px;font:600 28px/34px Arial,sans-serif">${t.title}</h1><p style="margin:0 0 24px">${t.intro}</p>${emailButton(t.button,link)}<p style="margin:24px 0 0;font-size:14px;color:#656474">Este link só pode ser usado uma vez. Se você não solicitou este acesso, ignore esta mensagem.</p>`;
 const html=emailFrame(t.subject,t.intro,body,'<p style="margin:0">Mensagem de acesso à sua conta. Suas preferências de recebimento podem ser gerenciadas no Radar.</p>',origin).replaceAll(link,'{{ .ConfirmationURL }}').replaceAll(origin,'{{ .SiteURL }}');
 if(!html.includes('href="{{ .ConfirmationURL }}"')||!html.includes('{{ .SiteURL }}/brand/ventura-lime.png')||html.includes(origin))throw Error('Invalid authentication template');
 await writeFile(new URL(t.file,directory),html);
 console.log(`${t.file}: ${t.subject}`);
}
