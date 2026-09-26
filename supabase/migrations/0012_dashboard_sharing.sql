-- Dashboards shared with chosen accesses (roles) and people, besides "everyone".
alter table dashboards add column if not exists share_with jsonb not null default '{"roles": [], "users": []}'::jsonb;
