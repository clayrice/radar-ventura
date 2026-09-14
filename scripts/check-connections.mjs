// Only report variable names and status; never print credentials or provider responses.
const groups={Supabase:['NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY'],OpenAI:['OPENAI_API_KEY'],Agendamento:['CRON_SECRET','APP_URL']};
let missing=false;
for(const [name,keys] of Object.entries(groups)){const absent=keys.filter(key=>!process.env[key]);console.log(`${name}: ${absent.length?'pendente — '+absent.join(', '):'variáveis presentes (conexão ainda não testada)'}`);if(absent.length)missing=true;}
console.log(`Modo de demonstração: ${process.env.DEMO_MODE==='true'?'ativo':'inativo'}`);
if(missing)process.exitCode=1;
