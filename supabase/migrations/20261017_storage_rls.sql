-- Storage: cada usuário só lista/lê/escreve na própria pasta.
-- Os buckets continuam públicos para leitura por URL (logo, PDF e fotos já publicados).

drop policy if exists "ob read docs" on storage.objects;
drop policy if exists "ob read photos" on storage.objects;
drop policy if exists "ob upload docs" on storage.objects;
drop policy if exists "ob upload photos" on storage.objects;

create policy "own read docs" on storage.objects for select to authenticated
using (bucket_id = 'profile_docs' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own insert docs" on storage.objects for insert to authenticated
with check (bucket_id = 'profile_docs' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own update docs" on storage.objects for update to authenticated
using (bucket_id = 'profile_docs' and (storage.foldername(name))[1] = auth.uid()::text)
with check (bucket_id = 'profile_docs' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own delete docs" on storage.objects for delete to authenticated
using (bucket_id = 'profile_docs' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "own read photos" on storage.objects for select to authenticated
using (bucket_id = 'lead_photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own insert photos" on storage.objects for insert to authenticated
with check (bucket_id = 'lead_photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own update photos" on storage.objects for update to authenticated
using (bucket_id = 'lead_photos' and (storage.foldername(name))[1] = auth.uid()::text)
with check (bucket_id = 'lead_photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own delete photos" on storage.objects for delete to authenticated
using (bucket_id = 'lead_photos' and (storage.foldername(name))[1] = auth.uid()::text);
