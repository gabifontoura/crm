-- Engineering: a role that answers the field's technical questions, and the
-- question itself, kept on the sub-ticket it is about.
alter table users drop constraint if exists users_role_check;
alter table users add constraint users_role_check check (role in ('admin', 'technician', 'broker', 'engineer'));

alter table tickets add column if not exists engineering jsonb;
create index if not exists tickets_engineering_open_idx on tickets ((engineering->>'status')) where engineering is not null;
