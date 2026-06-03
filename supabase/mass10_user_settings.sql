create table if not exists public.mass10_user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  supabase_project_url text not null default '',
  supabase_api_key text,
  supabase_table text not null default 'products',
  anthropic_api_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.mass10_user_settings enable row level security;

-- API keys are read and written by Next.js server routes with SUPABASE_SERVICE_ROLE_KEY.
-- No browser-facing policies are created here on purpose.
