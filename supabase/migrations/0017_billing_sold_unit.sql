-- What each payment plan sold (development, block and unit) and when it was bought.
alter table billing add column if not exists sold jsonb;
alter table billing add column if not exists purchased_on date;
