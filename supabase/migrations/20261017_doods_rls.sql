-- Dood's: fecha o acesso direto do cliente à carteira e impede chamadas anônimas
-- às funções de crédito/débito. A edge function `dood` continua usando service_role.

alter table public.wallets enable row level security;
alter table public.ledger enable row level security;
alter table public.pricing enable row level security;
alter table public.iap_products enable row level security;
alter table public.iap_transactions enable row level security;
alter table public.usage_log enable row level security;

revoke all on table public.wallets from anon, authenticated;
revoke all on table public.ledger from anon, authenticated;
revoke all on table public.pricing from anon, authenticated;
revoke all on table public.iap_products from anon, authenticated;
revoke all on table public.iap_transactions from anon, authenticated;
revoke all on table public.usage_log from anon, authenticated;

alter function public.charge_wallet(uuid, text, text, text) security definer;
alter function public.charge_wallet(uuid, text, text, text) set search_path = public, pg_temp;
alter function public.credit_wallet(uuid, bigint, text, text, text, text, numeric) security definer;
alter function public.credit_wallet(uuid, bigint, text, text, text, text, numeric) set search_path = public, pg_temp;
alter function public.dood_welcome(uuid) security definer;
alter function public.dood_welcome(uuid) set search_path = public, pg_temp;
alter function public.on_new_user_wallet() security definer;
alter function public.on_new_user_wallet() set search_path = public, pg_temp;

revoke execute on function public.charge_wallet(uuid, text, text, text) from public, anon, authenticated;
revoke execute on function public.credit_wallet(uuid, bigint, text, text, text, text, numeric) from public, anon, authenticated;
revoke execute on function public.dood_welcome(uuid) from public, anon, authenticated;
revoke execute on function public.on_new_user_wallet() from public, anon, authenticated;

grant execute on function public.charge_wallet(uuid, text, text, text) to service_role, postgres;
grant execute on function public.credit_wallet(uuid, bigint, text, text, text, text, numeric) to service_role, postgres, supabase_auth_admin;
grant execute on function public.dood_welcome(uuid) to service_role, postgres, supabase_auth_admin;
grant execute on function public.on_new_user_wallet() to service_role, postgres, supabase_auth_admin;

notify pgrst, 'reload schema';
