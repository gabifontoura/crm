-- Custom access profiles (stored in settings as "menuAccess"): a person may use
-- one; their role is the one the profile works like.
alter table users add column if not exists access_id text;
