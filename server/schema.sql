create table if not exists monthly_budgets (
  month_key text primary key,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists users (
  id text primary key,
  username text not null unique,
  display_name text,
  avatar_url text,
  theme_preference text not null default 'light',
  password_hash text not null,
  role text not null default 'user',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_login_at timestamptz,
  constraint users_role_check check (role in ('admin', 'user'))
);

create table if not exists password_reset_tokens (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  token_hash text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_password_reset_tokens_user_id on password_reset_tokens(user_id);
create index if not exists idx_password_reset_tokens_token_hash on password_reset_tokens(token_hash);

create table if not exists app_settings (
  id int primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists oauth_accounts (
  id text primary key,
  provider text not null,
  issuer text not null,
  subject text not null,
  user_id text not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (issuer, subject),
  unique (issuer, user_id)
);
