-- Add structured preferences without guessing selections for existing subscribers.
alter table public.profiles
 add column objective text check(objective in ('Economizar tempo','Reduzir custos','Vender mais','Melhorar o atendimento','Tomar decisões com dados','Entender por onde começar')),
 add column interests text[] not null default '{}' check(cardinality(interests)<=3 and interests <@ array['Marketing e conteúdo','Vendas e relacionamento','Atendimento ao cliente','Operação e processos','Finanças e administração','Pessoas e treinamento','Dados e relatórios']::text[]),
 add column business_model text check(business_model in ('Outras empresas (B2B)','Consumidores (B2C)','Empresas e consumidores')),
 add column ai_level text check(ai_level in ('Ainda não usamos IA','Usamos ferramentas pontualmente','Já temos IA em alguns processos','Queremos ampliar o que já funciona'));
-- goals remains for legacy records; new saves derive it from the chosen objective.
