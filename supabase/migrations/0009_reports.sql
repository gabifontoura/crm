-- Saved reports: the source, columns, filters, period, grouping and sorting
-- someone chose (as JSON), owned by one person and optionally shared.
create table if not exists reports (
  id          text primary key,
  name        text not null,
  description text not null default '',
  owner_id    text not null references users(id) on delete cascade,
  shared      boolean not null default false,
  source      text not null check (source in ('tickets', 'appointments', 'contacts')),
  columns     jsonb not null default '[]'::jsonb,
  date_field  text not null default 'created',
  period      jsonb not null default '{"kind":"30d"}'::jsonb,
  filters     jsonb not null default '{"state":"all"}'::jsonb,
  group_by    text,
  sort        jsonb not null default '{"column":"","dir":"desc"}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists reports_owner_idx on reports (owner_id);

alter table reports enable row level security;
