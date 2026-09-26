-- Access profiles: the "Back office" way of working (HR, finance, admin staff)
-- is stored as the role "staff".
alter table users drop constraint if exists users_role_check;
alter table users add constraint users_role_check check (role in ('admin', 'technician', 'broker', 'engineer', 'staff'));
