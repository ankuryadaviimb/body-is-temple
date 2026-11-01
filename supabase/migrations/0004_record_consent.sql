-- Temple: health records that wait for the person's OK before any AI reads them.
-- Free text (consultations, prescriptions, scans) can name a person in ways no filter finds
-- reliably, so such PDFs are stored with status 'consent' until the person taps "Read".
alter table public.health_documents drop constraint if exists health_documents_status_check;
alter table public.health_documents add constraint health_documents_status_check
  check (status in ('pending', 'done', 'no_text', 'image', 'consent', 'failed'));
