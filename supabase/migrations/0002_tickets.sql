-- Tickets with admin-defined workflows and custom fields.
-- Run after 0001_init.sql, in Supabase > SQL Editor.

-- A workflow keeps its statuses and transitions as JSON: they are edited
-- together in the workflow builder and always read as a whole.
create table if not exists workflows (
  id                 text primary key,
  name               text not null,
  description        text not null default '',
  initial_status_id  text not null,
  statuses           jsonb not null default '[]',   -- [{ id, name, color, category }]
  transitions        jsonb not null default '[]',   -- [{ id, from, to, label, roles, requireComment, requiredFields }]
  updated_at         timestamptz not null default now()
);

create table if not exists ticket_types (
  id                text primary key,
  name              text not null,
  description       text not null default '',
  color             text not null default '#2B6CB0',
  workflow_id       text not null references workflows (id) on delete restrict,
  default_priority  text not null default 'medium' check (default_priority in ('low', 'medium', 'high', 'urgent')),
  sla_hours         integer check (sla_hours is null or sla_hours > 0),
  active            boolean not null default true,
  fields            jsonb not null default '[]'     -- [{ id, label, kind, options, required, helpText }]
);

create table if not exists tickets (
  id               text primary key,
  number           integer not null unique,
  title            text not null,
  description      text not null default '',
  type_id          text not null references ticket_types (id) on delete restrict,
  status_id        text not null,
  priority         text not null default 'medium' check (priority in ('low', 'medium', 'high', 'urgent')),
  assignee_id      text references users (id) on delete set null,
  reporter_id      text not null references users (id) on delete restrict,
  requester_name   text not null default '',
  requester_email  text not null default '',
  requester_phone  text not null default '',
  client_id        text not null default '',
  client_name      text not null default '',
  development_id   text references developments (id) on delete set null,
  block_id         text references blocks (id) on delete set null,
  unit_id          text references units (id) on delete set null,
  property         text not null default '',
  location         text not null default '',
  due_at           timestamptz,
  fields           jsonb not null default '{}',     -- custom field values by field id
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  closed_at        timestamptz
);
create index if not exists tickets_assignee_idx on tickets (assignee_id);
create index if not exists tickets_type_status_idx on tickets (type_id, status_id);

-- Every creation, status change, comment and reassignment.
create table if not exists ticket_activity (
  id                text primary key,
  ticket_id         text not null references tickets (id) on delete cascade,
  at                timestamptz not null default now(),
  user_id           text not null references users (id) on delete restrict,
  kind              text not null check (kind in ('created', 'status', 'comment', 'assigned', 'edited', 'fields')),
  from_status_id    text,
  to_status_id      text,
  transition_label  text,
  comment           text,
  assignee_id       text
);
create index if not exists ticket_activity_ticket_idx on ticket_activity (ticket_id, at);

-- Only the API (service role) reads and writes these tables.
alter table workflows        enable row level security;
alter table ticket_types     enable row level security;
alter table tickets          enable row level security;
alter table ticket_activity  enable row level security;
