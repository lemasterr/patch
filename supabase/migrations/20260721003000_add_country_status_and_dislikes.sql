create type public.country_visit_status as enum ('visited', 'lived', 'wishlist');

alter table public.visited_countries
  add column status public.country_visit_status not null default 'visited';

create index visited_countries_user_status_idx
  on public.visited_countries (user_id, status);

alter type public.feed_action_type add value if not exists 'dislike';
