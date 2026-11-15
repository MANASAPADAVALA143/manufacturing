-- GNANOVA — Supabase Storage for invoices, RFQs, photos, PODs.
-- Private bucket; object path = <company_id>/<entity>/<record_id>/<uuid>-<file>.
-- Access mirrors the permissions on the owning record's module.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documents', 'documents', false, 15728640,
        array['image/jpeg','image/png','image/webp','image/heic','application/pdf','text/plain','text/csv',
              'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.ms-excel',
              'application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create or replace function app.storage_can(p_name text, p_action text) returns boolean
language plpgsql stable security definer set search_path = public, app, storage as $$
declare parts text[] := storage.foldername(p_name); v_company uuid;
begin
  if array_length(parts, 1) < 3 then return false; end if;
  begin
    v_company := parts[1]::uuid;
  exception when invalid_text_representation then
    return false;
  end;
  if p_action = 'write' then
    return app.can(v_company, app.module_of(parts[2]), 'create') or app.can(v_company, app.module_of(parts[2]), 'edit');
  end if;
  return app.can(v_company, app.module_of(parts[2]), p_action);
end $$;

create policy "documents read" on storage.objects for select to authenticated
  using (bucket_id = 'documents' and app.storage_can(name, 'view'));
create policy "documents upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'documents' and app.storage_can(name, 'write'));
create policy "documents delete" on storage.objects for delete to authenticated
  using (bucket_id = 'documents' and app.storage_can(name, 'delete'));
