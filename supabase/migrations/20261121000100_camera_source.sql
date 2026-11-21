-- A make or miss can also come from the camera (ball and hoop detection on the shooting page).
alter table public.shots drop constraint shots_source_check;
alter table public.shots add constraint shots_source_check
    check (source in ('manual', 'voice', 'teammate', 'camera', 'corrected'));
