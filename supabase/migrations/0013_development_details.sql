-- Developments: stage and progress of the works, photos (links with a kind:
-- photo, render, floor plan, construction) and apartment types. Units: their
-- type, bedrooms, bathrooms and garage spots.
alter table developments add column if not exists stage text;
alter table developments add column if not exists progress integer;
alter table developments add column if not exists photos jsonb not null default '[]'::jsonb;
alter table developments add column if not exists unit_types jsonb not null default '[]'::jsonb;
alter table units add column if not exists type_id text;
alter table units add column if not exists bedrooms integer not null default 0;
alter table units add column if not exists bathrooms integer not null default 0;
alter table units add column if not exists parking integer not null default 0;
alter table blocks add column if not exists photos jsonb not null default '[]'::jsonb;
