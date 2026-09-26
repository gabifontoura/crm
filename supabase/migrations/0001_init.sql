-- CRM schema for construction & property services.
-- Run once in Supabase > SQL Editor (or with `supabase db push`).
-- The API seeds fictional demo data on its first request.

-- Keeps updated_at current on every update.
create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- Team ---------------------------------------------------------------------
create table if not exists users (
  id          text primary key default gen_random_uuid()::text,
  name        text not null,
  email       text not null,
  phone       text not null default '',
  job_title   text not null default '',
  trade       text not null default '',
  -- admin sees every schedule; technician and broker see only their own
  role        text not null default 'technician' check (role in ('admin', 'technician', 'broker')),
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index if not exists users_email_key on users (lower(email));
drop trigger if exists users_updated_at on users;
create trigger users_updated_at before update on users for each row execute function set_updated_at();

-- Clients ------------------------------------------------------------------
create table if not exists clients (
  id            text primary key default gen_random_uuid()::text,
  name          text not null,
  contact_name  text not null default '',
  email         text not null default '',
  phone         text not null default '',
  created_at    timestamptz not null default now()
);

-- Developments > blocks > units ---------------------------------------------
create table if not exists developments (
  id             text primary key default gen_random_uuid()::text,
  name           text not null,
  client_id      text references clients (id) on delete set null,
  kind           text not null default 'residential'
                 check (kind in ('residential', 'commercial', 'mixed_use', 'institutional', 'industrial')),
  status         text not null default 'planning'
                 check (status in ('planning', 'under_construction', 'delivered', 'warranty')),
  address        text not null default '',
  city           text not null default '',
  delivery_date  date,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists developments_client_idx on developments (client_id);
drop trigger if exists developments_updated_at on developments;
create trigger developments_updated_at before update on developments for each row execute function set_updated_at();

create table if not exists blocks (
  id              text primary key default gen_random_uuid()::text,
  development_id  text not null references developments (id) on delete cascade,
  name            text not null,
  floors          integer not null default 1 check (floors between 1 and 200)
);
create index if not exists blocks_development_idx on blocks (development_id);

create table if not exists units (
  id         text primary key default gen_random_uuid()::text,
  block_id   text not null references blocks (id) on delete cascade,
  number     text not null,
  floor      integer not null default 1,
  kind       text not null default '',
  area_sqft  integer not null default 0 check (area_sqft >= 0),
  status     text not null default 'available' check (status in ('available', 'sold', 'delivered', 'in_warranty')),
  occupant   text not null default '',
  unique (block_id, number)
);
create index if not exists units_block_idx on units (block_id);

-- Calendar -----------------------------------------------------------------
create table if not exists calendar_events (
  id              text primary key,
  title           text not null,
  type            text not null,
  mode            text not null default 'on_site' check (mode in ('on_site', 'remote', 'hybrid')),
  completed       boolean not null default false,
  start_at        timestamptz not null,
  end_at          timestamptz not null check (end_at > start_at),
  project         text not null default '',
  client_id       text not null default '',
  client_name     text not null default '',
  ticket_number   text not null default '',
  owner_id        text not null references users (id) on delete restrict,
  property        text not null default '',
  development_id  text references developments (id) on delete set null,
  block_id        text references blocks (id) on delete set null,
  unit_id         text references units (id) on delete set null,
  location        text not null default '',
  notes           text not null default '',
  billable        boolean not null default false,
  group_activity  boolean not null default false,
  timecard_info   text not null default '',
  tags            text[] not null default '{}',
  hours           jsonb not null default '[]',
  files           jsonb not null default '[]',
  expenses        jsonb not null default '[]',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists calendar_events_owner_start_idx on calendar_events (owner_id, start_at);
create index if not exists calendar_events_start_idx on calendar_events (start_at);
create index if not exists calendar_events_development_idx on calendar_events (development_id);
drop trigger if exists calendar_events_updated_at on calendar_events;
create trigger calendar_events_updated_at before update on calendar_events for each row execute function set_updated_at();

-- What's New ---------------------------------------------------------------
create table if not exists releases (
  id              bigint primary key,
  title           text not null,
  description     text not null default '',
  what_changes    text not null default '',
  steps           jsonb not null default '[]',
  training_video  text,
  images          jsonb not null default '[]',
  release_date    text not null default '',  -- dd/mm/yyyy, as the page sends it
  release_time    text not null default '',
  author          text not null default '',
  type            text not null check (type in ('Melhoria', 'Correção')),
  product         text not null default '',
  created_at      timestamptz not null default now()
);

-- Shared settings (calendar colors, card fields, tags, seed flag) ----------
create table if not exists app_settings (
  key         text primary key,
  value       jsonb not null,
  updated_at  timestamptz not null default now()
);

-- Security -----------------------------------------------------------------
-- Only the API (service role key, server side) reads and writes these tables.
-- RLS on with no policies blocks the public anon key completely.
alter table users            enable row level security;
alter table clients          enable row level security;
alter table developments     enable row level security;
alter table blocks           enable row level security;
alter table units            enable row level security;
alter table calendar_events  enable row level security;
alter table releases         enable row level security;
alter table app_settings     enable row level security;
