-- "Timecard info" was removed from appointments (field, badge and card tag).
alter table calendar_events drop column if exists timecard_info;
