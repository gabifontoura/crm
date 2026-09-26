-- What's New: a third kind of note, "Novidade" (new feature).
alter table releases drop constraint if exists releases_type_check;
alter table releases add constraint releases_type_check check (type in ('Novidade', 'Melhoria', 'Correção'));
