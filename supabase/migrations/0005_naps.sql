-- Temple: daytime naps. Logged when the nap starts; its length is added on waking.
alter table public.events drop constraint if exists events_kind_check;
alter table public.events add constraint events_kind_check check (kind in (
  'wake', 'sleep', 'nap', 'water', 'drink', 'isabgol', 'meal', 'toilet', 'practice', 'sensation',
  'gas', 'walk', 'workout', 'weigh_in', 'mood', 'stress', 'intimacy', 'late_work', 'symptom', 'note'
));
