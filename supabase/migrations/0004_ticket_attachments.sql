-- Handle ticket screen: files attached to a ticket, and "attachment" entries
-- in its history. Run after 0003_field_service.sql.
-- Custom field show conditions (FieldDef.showWhen) live in ticket_types.fields
-- (jsonb) and need no schema change.

alter table tickets add column if not exists attachments jsonb not null default '[]';
-- [{ id, name, type, size, dataUrl, uploadedBy, uploadedAt }]

alter table ticket_activity drop constraint if exists ticket_activity_kind_check;
alter table ticket_activity add constraint ticket_activity_kind_check
  check (kind in ('created', 'status', 'comment', 'assigned', 'edited', 'fields', 'attachment'));
