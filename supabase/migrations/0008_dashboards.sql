-- Custom dashboards: a named grid of widgets (stored as JSON), owned by one
-- person and optionally shared with the team.
create table if not exists dashboards (
  id          text primary key,
  name        text not null,
  description text not null default '',
  owner_id    text not null references users(id) on delete cascade,
  shared      boolean not null default false,
  range       text not null default '90d',
  widgets     jsonb not null default '[]'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists dashboards_owner_idx on dashboards (owner_id);

alter table dashboards enable row level security;
