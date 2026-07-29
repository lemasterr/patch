alter table public.achievements
  add column location_latitude double precision,
  add column location_longitude double precision,
  add constraint achievement_coordinates_pair check (
    (location_latitude is null and location_longitude is null) or
    (
      location_latitude between -90 and 90 and
      location_longitude between -180 and 180
    )
  );

grant update (location_latitude, location_longitude)
on public.achievements to authenticated;

create index achievements_public_location_idx
on public.achievements (location_latitude, location_longitude)
where status = 'completed'
  and visibility = 'public'
  and location_latitude is not null;
