-- Emails sent when a ticket reaches a status (Settings › Workflows): they go
-- on the ticket's history, with who got them and what they said.
alter table ticket_activity drop constraint if exists ticket_activity_kind_check;
alter table ticket_activity add constraint ticket_activity_kind_check
  check (kind in ('created', 'status', 'comment', 'assigned', 'edited', 'fields', 'attachment', 'email'));
alter table ticket_activity add column if not exists email jsonb;
