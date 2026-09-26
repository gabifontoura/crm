-- Billing: one payment plan per deal (a sales ticket). Installments, their
-- payments, promises, renegotiations and cadence steps are kept as JSON.
create table if not exists billing (
  id             text primary key,
  ticket_id      text not null unique references tickets(id) on delete cascade,
  ticket_number  integer not null,
  customer       jsonb not null default '{}'::jsonb,
  property       text not null default '',
  total_price    numeric not null,
  installments   jsonb not null default '[]'::jsonb,
  created_by     text not null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

alter table billing enable row level security;
