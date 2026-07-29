create table public.visited_countries (
  user_id uuid not null references public.profiles(id) on delete cascade,
  country_code text not null check (country_code ~ '^[A-Z]{2}$'),
  visited_at date not null default current_date check (visited_at <= current_date),
  created_at timestamptz not null default now(),
  primary key (user_id, country_code)
);

create index visited_countries_user_date_idx
  on public.visited_countries (user_id, visited_at desc);

alter table public.visited_countries enable row level security;

create policy "visited_countries_read_own"
  on public.visited_countries for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "visited_countries_insert_own"
  on public.visited_countries for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "visited_countries_update_own"
  on public.visited_countries for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "visited_countries_delete_own"
  on public.visited_countries for delete to authenticated
  using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.visited_countries to authenticated;
