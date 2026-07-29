-- A report about a deleted account remains useful for abuse trend analysis but
-- must not keep a live profile FK or identifying reporter relationship.
alter table public.content_reports
  alter column reported_user_id drop not null;
alter table public.content_reports
  drop constraint if exists content_reports_reported_user_id_fkey;
alter table public.content_reports
  add constraint content_reports_reported_user_id_fkey
  foreign key (reported_user_id) references public.profiles(id) on delete set null;
