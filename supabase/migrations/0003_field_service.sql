-- Field service reports (check-in, checklist, parts, photos, signature),
-- stored with the appointment. Run after 0002_tickets.sql.
alter table calendar_events add column if not exists service jsonb;
