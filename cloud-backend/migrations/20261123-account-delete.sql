-- Run in one transaction. Deploy code that checks redeemed_at before these
-- foreign keys are changed, or keep the API offline until both are live.
set local lock_timeout = '3s';

update software_license_cards
   set redeemed_at = created_at
 where redeemed_by is not null and redeemed_at is null;

alter table software_license_cards
  drop constraint if exists software_license_cards_redeemed_by_fkey,
  add constraint software_license_cards_redeemed_by_fkey foreign key(redeemed_by)
    references app_users(id) on delete set null not valid;
alter table software_license_orders
  drop constraint if exists software_license_orders_user_id_fkey,
  add constraint software_license_orders_user_id_fkey foreign key(user_id)
    references app_users(id) on delete set null not valid;

alter table software_license_cards validate constraint software_license_cards_redeemed_by_fkey;
alter table software_license_orders validate constraint software_license_orders_user_id_fkey;
