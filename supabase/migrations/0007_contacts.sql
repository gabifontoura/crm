-- Contacts: lead portfolios. Each lead is owned by one team member (its
-- portfolio); interactions (calls, emails, transfers...) are kept as JSON.
create table if not exists contacts (
  id              text primary key,
  name            text not null,
  email           text not null default '',
  phone           text not null default '',
  company         text not null default '',
  owner_id        text references users(id) on delete set null,
  stage_id        text not null,
  temperature     text not null default 'warm' check (temperature in ('hot', 'warm', 'cold')),
  source          text not null default '',
  development_id  text references developments(id) on delete set null,
  budget          numeric,
  notes           text not null default '',
  next_follow_up  date,
  last_contact_at timestamptz,
  interactions    jsonb not null default '[]'::jsonb,
  created_by      text not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists contacts_owner_idx on contacts (owner_id);
create index if not exists contacts_email_idx on contacts (lower(email));

alter table contacts enable row level security;
