-- Sub-tickets: follow-ups split from a ticket, e.g. a task action a
-- technician left for later. Run after 0004_ticket_attachments.sql.
alter table tickets add column if not exists parent_id text references tickets (id) on delete set null;
alter table tickets add column if not exists origin jsonb;  -- { eventId, actionId, actionLabel }
create index if not exists tickets_parent_idx on tickets (parent_id);
