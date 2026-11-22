-- Restore the old constraint behavior. This does not recreate an account
-- deleted after activation or restore its former references.
set local lock_timeout = '3s';
-- Older API code keyed redemption exclusively on redeemed_by.
update software_license_cards set disabled=true where redeemed_by is null and redeemed_at is not null;
alter table software_license_cards
  drop constraint if exists software_license_cards_redeemed_by_fkey,
  add constraint software_license_cards_redeemed_by_fkey foreign key(redeemed_by) references app_users(id);
alter table software_license_orders
  drop constraint if exists software_license_orders_user_id_fkey,
  add constraint software_license_orders_user_id_fkey foreign key(user_id) references app_users(id);
