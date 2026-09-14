import Link from 'next/link';
import {redirect} from 'next/navigation';
import {LoginForm} from '@/components/login-form';
import {isDemo,configured,sessionDb} from '@/lib/db';
import {authDestination} from '@/lib/auth-navigation';
export const dynamic='force-dynamic';
export default async function Login({searchParams}:{searchParams:Promise<{error?:string;next?:string}>}){
 const params=await searchParams;const next=authDestination(params.next);const partner=next==='/account/parceiro';const demo=isDemo();
 if(!demo&&configured()){const db=await sessionDb();const {data:{user}}=await db.auth.getUser();if(user)redirect(next);}
 return <main id="main" className="login">
  <span className="eyebrow">{partner?'SEJA PARCEIRO VENTURA':'SUA CONTA VENTURA'}</span>
  <h1>{partner?<>Seu conhecimento.<br/><em>Empresas com rumo.</em></>:<>IA com rumo.<br/><em>Para o seu negócio.</em></>}</h1>
  <p>{partner?'Entre ou crie sua conta para cadastrar sua empresa como parceira.':'Entre ou crie sua conta para personalizar sua edição semanal.'} Use sua conta Google ou receba um link por email.</p>
  {params.error&&<p role="alert">Não foi possível concluir o acesso. O link pode ter expirado ou a conexão foi cancelada. Tente novamente.</p>}
  {demo&&<p className="notice">Demonstração. O login com Google e email ainda depende da configuração do serviço.</p>}
  <LoginForm next={next}/>
  {demo&&<Link className="text-link" href={next}>Explorar {partner?'o cadastro de parceiro':'a conta'} de exemplo ↗</Link>}
  <p>Consulte nossa <Link className="text-link" href="/privacy">política de privacidade</Link>. Criar uma conta não ativa uma assinatura. O email semanal é opcional.</p>
 </main>;
}
