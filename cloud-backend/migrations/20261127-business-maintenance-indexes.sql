-- Run outside a transaction so writes can continue during index creation.
create index concurrently if not exists collab_media_id_text_idx on collab_media((id::text));
create index concurrently if not exists app_sessions_expiry_idx on app_sessions(expires_at);
create index concurrently if not exists email_codes_expiry_idx on email_codes(expires_at);
create index concurrently if not exists director_live_updates_expiry_idx on director_live_updates(created_at) where octet_length(delta)>0;
