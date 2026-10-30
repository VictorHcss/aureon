-- =====================================================================
-- Monitor de Preços — migração inicial
-- Cria tabelas, restrições, índices, gatilhos e RLS.
-- Todo o acesso é feito pelo servidor com a chave service_role
-- (painel autenticado e GitHub Actions). Com RLS ativo e sem políticas,
-- a chave anon/publishable NÃO consegue ler nem gravar nada.
-- =====================================================================

create extension if not exists pgcrypto;

-- Atualiza updated_at automaticamente
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- Categorias
-- ---------------------------------------------------------------------
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now(),
  constraint categories_name_not_blank check (length(trim(name)) > 0)
);
create unique index categories_name_unique on public.categories (lower(name));

insert into public.categories (name) values
  ('Processadores'),
  ('Placas de vídeo'),
  ('Placas-mãe'),
  ('Memória RAM'),
  ('SSDs e HDs'),
  ('Notebooks'),
  ('Monitores'),
  ('Periféricos'),
  ('Smartphones'),
  ('Componentes e acessórios'),
  ('Outros');

-- ---------------------------------------------------------------------
-- Produtos
-- ---------------------------------------------------------------------
create table public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  brand text,
  model text,
  category_id uuid references public.categories (id) on delete set null,
  target_price numeric(12, 2),
  max_price numeric(12, 2),
  notes text,
  active boolean not null default true,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint products_name_not_blank check (length(trim(name)) > 0),
  constraint products_target_positive check (target_price is null or target_price > 0),
  constraint products_max_positive check (max_price is null or max_price > 0)
);
create index products_category_idx on public.products (category_id);
create index products_active_idx on public.products (active) where archived_at is null;
create trigger products_updated_at before update on public.products
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- Fontes (uma URL de loja por linha; vários por produto)
-- ---------------------------------------------------------------------
create table public.product_sources (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  store_name text not null,
  product_url text not null,
  source_type text not null,
  external_identifier text,
  active boolean not null default true,
  last_checked_at timestamptz,
  last_success_at timestamptz,
  last_status text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_sources_url_https check (product_url like 'https://%'),
  constraint product_sources_status_valid check (
    last_status is null or last_status in (
      'success', 'unavailable', 'temporary_failure', 'structure_changed',
      'price_not_found', 'auth_error', 'invalid_source'
    )
  )
);
create index product_sources_product_idx on public.product_sources (product_id);
create unique index product_sources_unique_external
  on public.product_sources (product_id, source_type, external_identifier)
  where external_identifier is not null;
create trigger product_sources_updated_at before update on public.product_sources
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- Execuções de coleta
-- ---------------------------------------------------------------------
create table public.collection_runs (
  id uuid primary key default gen_random_uuid(),
  run_key text,
  trigger text not null default 'manual',
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running',
  products_processed integer not null default 0,
  sources_processed integer not null default 0,
  successes integer not null default 0,
  failures integer not null default 0,
  error_summary text,
  github_run_id text,
  constraint collection_runs_status_valid check (status in ('running', 'success', 'partial', 'failed')),
  constraint collection_runs_trigger_valid check (trigger in ('schedule', 'manual', 'panel'))
);
-- Impede duas execuções agendadas no mesmo dia (idempotência)
create unique index collection_runs_run_key_unique on public.collection_runs (run_key) where run_key is not null;
create index collection_runs_started_idx on public.collection_runs (started_at desc);

-- ---------------------------------------------------------------------
-- Histórico de preços
-- ---------------------------------------------------------------------
create table public.price_history (
  id uuid primary key default gen_random_uuid(),
  product_source_id uuid not null references public.product_sources (id) on delete cascade,
  run_id uuid references public.collection_runs (id) on delete set null,
  price numeric(12, 2),
  original_price numeric(12, 2),
  shipping_price numeric(12, 2),
  currency char(3) not null default 'BRL',
  availability_status text not null default 'unknown',
  collection_status text not null,
  seller_id text,
  collected_at timestamptz not null default now(),
  source_url text,
  metadata jsonb not null default '{}'::jsonb,
  constraint price_history_status_valid check (collection_status in (
    'success', 'unavailable', 'temporary_failure', 'structure_changed',
    'price_not_found', 'auth_error', 'invalid_source'
  )),
  constraint price_history_availability_valid check (availability_status in ('in_stock', 'out_of_stock', 'unknown')),
  -- Uma coleta de sucesso precisa ter preço positivo; preço ausente nunca vira 0
  constraint price_history_success_has_price check (collection_status <> 'success' or (price is not null and price > 0)),
  constraint price_history_price_positive check (price is null or price > 0),
  constraint price_history_shipping_non_negative check (shipping_price is null or shipping_price >= 0)
);
create index price_history_source_time_idx on public.price_history (product_source_id, collected_at desc);
create index price_history_success_idx on public.price_history (product_source_id, collected_at desc)
  where collection_status = 'success';
-- No máximo um registro por fonte em cada execução
create unique index price_history_source_run_unique on public.price_history (product_source_id, run_id)
  where run_id is not null;

-- ---------------------------------------------------------------------
-- Regras de alerta
-- ---------------------------------------------------------------------
create table public.alert_rules (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  rule_type text not null,
  threshold numeric(12, 2),
  cooldown_hours integer not null default 24,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint alert_rules_type_valid check (rule_type in (
    'target_price', 'percent_drop', 'historic_low', 'abs_change', 'back_in_stock', 'stale_data'
  )),
  constraint alert_rules_cooldown_valid check (cooldown_hours between 0 and 720),
  constraint alert_rules_threshold_valid check (threshold is null or threshold > 0)
);
create index alert_rules_product_idx on public.alert_rules (product_id);
create trigger alert_rules_updated_at before update on public.alert_rules
  for each row execute function public.set_updated_at();

-- Eventos de alerta já processados (deduplicação)
create table public.alert_events (
  id uuid primary key default gen_random_uuid(),
  rule_id uuid references public.alert_rules (id) on delete set null,
  product_id uuid references public.products (id) on delete cascade,
  product_source_id uuid references public.product_sources (id) on delete cascade,
  rule_type text not null,
  event_key text not null unique,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index alert_events_rule_source_idx on public.alert_events (rule_id, product_source_id, created_at desc);

-- ---------------------------------------------------------------------
-- Registro de notificações
-- ---------------------------------------------------------------------
create table public.notification_logs (
  id uuid primary key default gen_random_uuid(),
  channel text not null,
  kind text not null,
  product_id uuid references public.products (id) on delete set null,
  event_key text not null,
  status text not null,
  provider_message_id text,
  error_message text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  constraint notification_logs_channel_valid check (channel in ('email', 'telegram', 'whatsapp')),
  constraint notification_logs_kind_valid check (kind in ('alert', 'daily_report', 'test')),
  constraint notification_logs_status_valid check (status in ('sent', 'failed', 'skipped'))
);
-- Um mesmo evento só pode ser ENVIADO uma vez por canal
create unique index notification_logs_sent_unique on public.notification_logs (channel, event_key)
  where status = 'sent';
create index notification_logs_created_idx on public.notification_logs (created_at desc);

-- ---------------------------------------------------------------------
-- Configurações de notificação (linha única)
-- ---------------------------------------------------------------------
create table public.notification_settings (
  id integer primary key default 1,
  email_enabled boolean not null default false,
  email_to text,
  telegram_enabled boolean not null default false,
  telegram_chat_id text,
  whatsapp_enabled boolean not null default false,
  whatsapp_to text,
  daily_summary_enabled boolean not null default true,
  alerts_enabled boolean not null default true,
  only_relevant boolean not null default false,
  stale_after_hours integer not null default 48,
  updated_at timestamptz not null default now(),
  constraint notification_settings_single_row check (id = 1),
  constraint notification_settings_stale_valid check (stale_after_hours between 1 and 720)
);
insert into public.notification_settings (id) values (1);
create trigger notification_settings_updated_at before update on public.notification_settings
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- Tokens de integrações (ex.: OAuth do Mercado Livre).
-- Somente o servidor (service_role) acessa.
-- ---------------------------------------------------------------------
create table public.integration_tokens (
  provider text primary key,
  access_token text,
  refresh_token text,
  expires_at timestamptz,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- RLS: ativado em todas as tabelas e sem políticas para anon/authenticated.
-- A service_role ignora RLS por definição.
-- ---------------------------------------------------------------------
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.product_sources enable row level security;
alter table public.collection_runs enable row level security;
alter table public.price_history enable row level security;
alter table public.alert_rules enable row level security;
alter table public.alert_events enable row level security;
alter table public.notification_logs enable row level security;
alter table public.notification_settings enable row level security;
alter table public.integration_tokens enable row level security;

revoke all on all tables in schema public from anon, authenticated;
