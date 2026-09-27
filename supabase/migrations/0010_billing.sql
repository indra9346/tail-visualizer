-- ============================================================
-- 0010: credits ledger, payments, credit packages, admin flag
--
-- Design
--   * credit_accounts     one row per user; `balance` is a CACHE that is only
--                         ever changed by the SQL functions below, inside the
--                         same transaction that writes the ledger row.
--   * credit_transactions the immutable ledger. Every balance change has
--                         exactly one row with the signed `amount` and the
--                         resulting `balance_after`. Rows are never updated
--                         except a generation hold moving held -> committed /
--                         released (enforced by trigger). idempotency_key is
--                         UNIQUE, so replaying a payment/webhook/hold can never
--                         credit or charge twice.
--   * payments            one row per checkout order (provider = razorpay).
--   * payment_events      every provider webhook event id, for replay defence.
--   * credit_packages     purchasable packages (configurable, admin-editable later).
--
--   Generation charging is reserve -> commit / release:
--     credit_hold    debits immediately (balance can never go below 0),
--     credit_commit  finalizes the charge on success,
--     credit_release re-credits the hold on failure (a 'generation_release' row).
--     credit_release_stale_holds() re-credits holds orphaned by a crashed request.
--
-- Security
--   * RLS on every table; authenticated users can only SELECT their own rows.
--   * NO client write privileges. All functions are SECURITY DEFINER with a
--     pinned search_path and EXECUTE granted to service_role only.
--
-- Additive and non-destructive. Idempotent: safe to re-run.
-- ============================================================

-- ---------- tables ----------

create table if not exists credit_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  balance integer not null default 0 check (balance >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists credit_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('purchase', 'generation_hold', 'generation_release', 'adjustment', 'promotional', 'refund')),
  amount integer not null check (amount <> 0),
  balance_after integer not null check (balance_after >= 0),
  status text not null default 'posted' check (status in ('posted', 'held', 'committed', 'released')),
  reference_type text,
  reference_id text,
  description text not null,
  metadata jsonb not null default '{}'::jsonb,
  idempotency_key text not null unique,
  created_at timestamptz not null default now()
);
create index if not exists idx_credit_tx_user_created on credit_transactions (user_id, created_at desc);
create index if not exists idx_credit_tx_reference on credit_transactions (reference_type, reference_id);
create index if not exists idx_credit_tx_held on credit_transactions (status, created_at) where status = 'held';

create table if not exists credit_packages (
  id text primary key,
  name text not null,
  description text,
  credits integer not null check (credits > 0),
  bonus_credits integer not null default 0 check (bonus_credits >= 0),
  price_paise integer not null check (price_paise > 0),
  currency text not null default 'INR',
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null default 'razorpay',
  provider_order_id text not null unique,
  provider_payment_id text unique,
  package_id text not null,
  package_name text not null,
  amount_paise integer not null check (amount_paise > 0),
  currency text not null default 'INR',
  credits integer not null check (credits > 0),
  status text not null default 'created' check (status in ('created', 'paid', 'failed', 'refunded')),
  failure_reason text,
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  updated_at timestamptz not null default now()
);
create index if not exists idx_payments_user_created on payments (user_id, created_at desc);

create table if not exists payment_events (
  provider_event_id text primary key,
  provider text not null default 'razorpay',
  event_type text not null,
  payload jsonb not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

alter table profiles add column if not exists is_admin boolean not null default false;
alter table visualizations add column if not exists credits_charged integer not null default 0 check (credits_charged >= 0);

-- ---------- ledger immutability ----------

create or replace function credit_tx_guard() returns trigger
language plpgsql
set search_path = public
as $$
begin
  if (new.id, new.user_id, new.type, new.amount, new.balance_after, new.reference_type, new.reference_id, new.description, new.metadata, new.idempotency_key, new.created_at)
     is distinct from
     (old.id, old.user_id, old.type, old.amount, old.balance_after, old.reference_type, old.reference_id, old.description, old.metadata, old.idempotency_key, old.created_at) then
    raise exception 'credit_transactions rows are immutable';
  end if;
  if new.status is distinct from old.status and not (old.status = 'held' and new.status in ('committed', 'released')) then
    raise exception 'illegal ledger status change % -> %', old.status, new.status;
  end if;
  return new;
end $$;

drop trigger if exists trg_credit_tx_guard on credit_transactions;
create trigger trg_credit_tx_guard before update on credit_transactions for each row execute function credit_tx_guard();

-- ---------- core ledger functions ----------

-- Signed, atomic balance change with a ledger row. Idempotent on p_idem.
create or replace function credit_apply(
  p_user uuid, p_amount integer, p_type text, p_desc text,
  p_ref_type text, p_ref_id text, p_meta jsonb, p_idem text, p_status text default 'posted'
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  acct credit_accounts%rowtype;
  existing credit_transactions%rowtype;
  tx credit_transactions%rowtype;
begin
  if p_amount = 0 then raise exception 'INVALID_AMOUNT'; end if;
  if p_idem is null or length(p_idem) = 0 then raise exception 'IDEMPOTENCY_KEY_REQUIRED'; end if;

  insert into credit_accounts (user_id) values (p_user) on conflict (user_id) do nothing;
  select * into acct from credit_accounts where user_id = p_user for update;   -- serializes every change for this user

  select * into existing from credit_transactions where idempotency_key = p_idem;
  if found then
    if existing.user_id <> p_user then raise exception 'IDEMPOTENCY_KEY_CONFLICT'; end if;
    return jsonb_build_object('transaction_id', existing.id, 'balance', acct.balance, 'duplicate', true, 'status', existing.status);
  end if;

  if acct.balance + p_amount < 0 then raise exception 'INSUFFICIENT_CREDITS'; end if;

  update credit_accounts set balance = balance + p_amount, updated_at = now() where user_id = p_user returning * into acct;
  insert into credit_transactions (user_id, type, amount, balance_after, status, reference_type, reference_id, description, metadata, idempotency_key)
    values (p_user, p_type, p_amount, acct.balance, p_status, p_ref_type, p_ref_id, p_desc, coalesce(p_meta, '{}'::jsonb), p_idem)
    returning * into tx;
  return jsonb_build_object('transaction_id', tx.id, 'balance', acct.balance, 'duplicate', false, 'status', tx.status);
end $$;

-- Reserve credits for a generation. Fails with INSUFFICIENT_CREDITS (and changes nothing) if the balance is too low.
create or replace function credit_hold(p_user uuid, p_amount integer, p_ref_id text, p_idem text, p_meta jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path = public
as $$
begin
  if p_amount <= 0 then raise exception 'INVALID_AMOUNT'; end if;
  return credit_apply(p_user, -p_amount, 'generation_hold', 'Visualization generation', 'visualization', p_ref_id, p_meta, p_idem, 'held');
end $$;

-- Success: the reserved credits become a final charge.
create or replace function credit_commit(p_hold_id uuid) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare h credit_transactions%rowtype;
begin
  select * into h from credit_transactions where id = p_hold_id and type = 'generation_hold' for update;
  if not found then raise exception 'HOLD_NOT_FOUND'; end if;
  if h.status = 'released' then raise exception 'HOLD_ALREADY_RELEASED'; end if;
  if h.status = 'held' then update credit_transactions set status = 'committed' where id = h.id; end if;
  return jsonb_build_object('hold_id', h.id, 'credits', -h.amount, 'status', 'committed');
end $$;

-- Failure: give the reserved credits back (once).
create or replace function credit_release(p_hold_id uuid, p_reason text default 'Generation did not complete') returns jsonb
language plpgsql security definer set search_path = public
as $$
declare h credit_transactions%rowtype; r jsonb;
begin
  select * into h from credit_transactions where id = p_hold_id and type = 'generation_hold' for update;
  if not found then raise exception 'HOLD_NOT_FOUND'; end if;
  if h.status = 'committed' then raise exception 'HOLD_ALREADY_COMMITTED'; end if;
  if h.status = 'released' then
    return jsonb_build_object('hold_id', h.id, 'released', false, 'duplicate', true);
  end if;
  update credit_transactions set status = 'released' where id = h.id;
  r := credit_apply(h.user_id, -h.amount, 'generation_release', p_reason, 'visualization', h.reference_id,
                    jsonb_build_object('hold_id', h.id), 'release:' || h.id::text, 'posted');
  return jsonb_build_object('hold_id', h.id, 'released', true, 'credits', -h.amount, 'balance', r->'balance');
end $$;

-- Safety net for a crashed/timed-out request: re-credit holds that never finished.
create or replace function credit_release_stale_holds(p_user uuid default null, p_older_than interval default interval '15 minutes') returns integer
language plpgsql security definer set search_path = public
as $$
declare h record; n integer := 0;
begin
  for h in
    select id from credit_transactions
     where type = 'generation_hold' and status = 'held' and created_at < now() - p_older_than
       and (p_user is null or user_id = p_user)
     order by created_at
  loop
    perform credit_release(h.id, 'Generation did not finish - credits returned');
    n := n + 1;
  end loop;
  return n;
end $$;

-- ---------- payments ----------

-- Marks a payment paid and credits the user, exactly once, in ONE transaction.
create or replace function payment_apply_paid(
  p_order_id text, p_payment_id text, p_amount_paise integer, p_currency text
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare p payments%rowtype; r jsonb;
begin
  select * into p from payments where provider_order_id = p_order_id for update;
  if not found then raise exception 'PAYMENT_NOT_FOUND'; end if;
  if p.status = 'paid' then
    return jsonb_build_object('payment_id', p.id, 'credited', false, 'duplicate', true, 'credits', p.credits);
  end if;
  if p.amount_paise <> p_amount_paise or upper(p.currency) <> upper(p_currency) then raise exception 'PAYMENT_AMOUNT_MISMATCH'; end if;

  update payments set status = 'paid', provider_payment_id = p_payment_id, paid_at = now(), updated_at = now(), failure_reason = null where id = p.id;
  r := credit_apply(p.user_id, p.credits, 'purchase', 'Purchased ' || p.package_name || ' credits', 'payment', p.id::text,
                    jsonb_build_object('provider_order_id', p_order_id, 'provider_payment_id', p_payment_id, 'package_id', p.package_id, 'amount_paise', p.amount_paise, 'currency', p.currency),
                    'payment:' || p_order_id, 'posted');
  return jsonb_build_object('payment_id', p.id, 'credited', true, 'duplicate', false, 'credits', p.credits, 'balance', r->'balance');
end $$;

create or replace function payment_mark_failed(p_order_id text, p_reason text) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare p payments%rowtype;
begin
  select * into p from payments where provider_order_id = p_order_id for update;
  if not found then return jsonb_build_object('updated', false); end if;
  if p.status <> 'created' then return jsonb_build_object('updated', false, 'status', p.status); end if;   -- never downgrade a paid payment
  update payments set status = 'failed', failure_reason = left(coalesce(p_reason, 'Payment failed'), 300), updated_at = now() where id = p.id;
  return jsonb_build_object('updated', true);
end $$;

-- Provider refunded a payment: mark it refunded and claw the purchased credits back (never below zero).
create or replace function payment_apply_refund(p_order_id text, p_refund_id text) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare p payments%rowtype; take integer; bal integer;
begin
  select * into p from payments where provider_order_id = p_order_id for update;
  if not found then raise exception 'PAYMENT_NOT_FOUND'; end if;
  if p.status = 'refunded' then return jsonb_build_object('duplicate', true); end if;
  if p.status <> 'paid' then return jsonb_build_object('ignored', true, 'status', p.status); end if;
  update payments set status = 'refunded', updated_at = now() where id = p.id;
  select balance into bal from credit_accounts where user_id = p.user_id for update;
  take := least(p.credits, coalesce(bal, 0));
  if take > 0 then
    perform credit_apply(p.user_id, -take, 'refund', 'Refund for ' || p.package_name || ' credits', 'payment', p.id::text,
                         jsonb_build_object('provider_refund_id', p_refund_id, 'credits_purchased', p.credits, 'credits_reclaimed', take),
                         'refund:' || p_order_id, 'posted');
  end if;
  return jsonb_build_object('refunded', true, 'credits_reclaimed', take);
end $$;

-- ---------- read models ----------

create or replace function billing_summary(p_user uuid) returns jsonb
language sql security definer set search_path = public stable
as $$
  with
  day0 as (select date_trunc('day', now() at time zone 'Asia/Kolkata') as d),
  used as (
    select
      coalesce(sum(-amount) filter (where (created_at at time zone 'Asia/Kolkata') >= (select d from day0)), 0)                        as today,
      coalesce(sum(-amount) filter (where (created_at at time zone 'Asia/Kolkata') >= (select d from day0) - interval '6 days'), 0)    as week,
      coalesce(sum(-amount) filter (where (created_at at time zone 'Asia/Kolkata') >= date_trunc('month', (select d from day0))), 0)   as month,
      coalesce(sum(-amount), 0)                                                                                                         as total,
      coalesce(sum(-amount) filter (where status = 'held'), 0)                                                                          as reserved
    from credit_transactions where user_id = p_user and type = 'generation_hold' and status in ('held', 'committed')
  ),
  gens as (
    select count(*) as total,
           count(*) filter (where status = 'completed') as completed,
           count(*) filter (where status = 'failed') as failed,
           count(*) filter (where status in ('pending', 'generating')) as in_progress
    from visualizations where user_id = p_user
  ),
  pays as (
    select count(*) filter (where status = 'paid') as paid,
           count(*) filter (where status = 'created') as pending,
           count(*) filter (where status = 'failed') as failed,
           count(*) filter (where status = 'refunded') as refunded,
           coalesce(sum(amount_paise) filter (where status = 'paid'), 0) as paid_paise,
           coalesce(sum(amount_paise) filter (where status = 'refunded'), 0) as refunded_paise
    from payments where user_id = p_user
  )
  select jsonb_build_object(
    'balance', coalesce((select balance from credit_accounts where user_id = p_user), 0),
    'used', jsonb_build_object('today', used.today, 'week', used.week, 'month', used.month, 'total', used.total, 'reserved', used.reserved),
    'generations', jsonb_build_object('total', gens.total, 'completed', gens.completed, 'failed', gens.failed, 'in_progress', gens.in_progress),
    'payments', jsonb_build_object('paid', pays.paid, 'pending', pays.pending, 'failed', pays.failed, 'refunded', pays.refunded,
                                    'paid_paise', pays.paid_paise, 'refunded_paise', pays.refunded_paise)
  ) from used, gens, pays;
$$;

create or replace function admin_overview() returns jsonb
language sql security definer set search_path = public stable
as $$
  select jsonb_build_object(
    'users', jsonb_build_object(
      'total', (select count(*) from auth.users),
      'active_30d', (select count(distinct user_id) from visualizations where created_at > now() - interval '30 days')),
    'credits', jsonb_build_object(
      'purchased', coalesce((select sum(amount) from credit_transactions where type = 'purchase'), 0),
      'consumed', coalesce((select sum(-amount) from credit_transactions where type = 'generation_hold' and status = 'committed'), 0),
      'reserved', coalesce((select sum(-amount) from credit_transactions where type = 'generation_hold' and status = 'held'), 0),
      'outstanding', coalesce((select sum(balance) from credit_accounts), 0)),
    'generations', jsonb_build_object(
      'total', (select count(*) from visualizations),
      'completed', (select count(*) from visualizations where status = 'completed'),
      'failed', (select count(*) from visualizations where status = 'failed')),
    'payments', jsonb_build_object(
      'paid_count', (select count(*) from payments where status = 'paid'),
      'paid_paise', coalesce((select sum(amount_paise) from payments where status = 'paid'), 0),
      'failed_count', (select count(*) from payments where status = 'failed'),
      'refunded_count', (select count(*) from payments where status = 'refunded')),
    'recent_transactions', coalesce((select jsonb_agg(t) from (
        select id, user_id, type, amount, balance_after, status, description, created_at from credit_transactions order by created_at desc limit 15) t), '[]'::jsonb),
    'recent_errors', coalesce((select jsonb_agg(e) from (
        select v.id, v.user_id, left(v.error_message, 200) as error_message, v.created_at from visualizations v where v.status = 'failed' order by v.created_at desc limit 10) e), '[]'::jsonb)
  );
$$;

-- ---------- seed: purchasable packages (edit prices/credits freely; they are data, not code) ----------

insert into credit_packages (id, name, description, credits, bonus_credits, price_paise, sort_order) values
  ('starter',      'Starter',      'Try the visualizer on a few rooms.',            100,    0,  49900, 1),
  ('professional', 'Professional', 'For a working showroom with regular customers.', 300,   30, 129900, 2),
  ('business',     'Business',     'High-volume showroom or multiple staff.',       1000,  150, 399900, 3)
on conflict (id) do nothing;

-- ---------- RLS + privileges: read-only for users, everything else server-side ----------

alter table credit_accounts     enable row level security;
alter table credit_transactions enable row level security;
alter table credit_packages     enable row level security;
alter table payments            enable row level security;
alter table payment_events      enable row level security;

drop policy if exists "credit_accounts_select_own"     on credit_accounts;
drop policy if exists "credit_transactions_select_own" on credit_transactions;
drop policy if exists "credit_packages_select_active"  on credit_packages;
drop policy if exists "payments_select_own"            on payments;
create policy "credit_accounts_select_own"     on credit_accounts     for select using (auth.uid() = user_id);
create policy "credit_transactions_select_own" on credit_transactions for select using (auth.uid() = user_id);
create policy "credit_packages_select_active"  on credit_packages     for select using (is_active);
create policy "payments_select_own"            on payments            for select using (auth.uid() = user_id);
-- payment_events: no policy at all => invisible to every client role.

revoke all on credit_accounts, credit_transactions, credit_packages, payments, payment_events from anon, authenticated;
grant select on credit_accounts, credit_transactions, credit_packages, payments to authenticated;
grant all on credit_accounts, credit_transactions, credit_packages, payments, payment_events to service_role;

-- The client may READ profiles (own row); it can never write is_admin (no write privilege/policy exists).

revoke all on function credit_apply(uuid, integer, text, text, text, text, jsonb, text, text) from public, anon, authenticated;
revoke all on function credit_hold(uuid, integer, text, text, jsonb)                          from public, anon, authenticated;
revoke all on function credit_commit(uuid)                                                    from public, anon, authenticated;
revoke all on function credit_release(uuid, text)                                             from public, anon, authenticated;
revoke all on function credit_release_stale_holds(uuid, interval)                             from public, anon, authenticated;
revoke all on function payment_apply_paid(text, text, integer, text)                          from public, anon, authenticated;
revoke all on function payment_mark_failed(text, text)                                        from public, anon, authenticated;
revoke all on function payment_apply_refund(text, text)                                       from public, anon, authenticated;
revoke all on function billing_summary(uuid)                                                  from public, anon, authenticated;
revoke all on function admin_overview()                                                       from public, anon, authenticated;
revoke all on function credit_tx_guard()                                                      from public, anon, authenticated;
grant execute on function credit_apply(uuid, integer, text, text, text, text, jsonb, text, text) to service_role;
grant execute on function credit_hold(uuid, integer, text, text, jsonb)                          to service_role;
grant execute on function credit_commit(uuid)                                                    to service_role;
grant execute on function credit_release(uuid, text)                                             to service_role;
grant execute on function credit_release_stale_holds(uuid, interval)                             to service_role;
grant execute on function payment_apply_paid(text, text, integer, text)                          to service_role;
grant execute on function payment_mark_failed(text, text)                                        to service_role;
grant execute on function payment_apply_refund(text, text)                                       to service_role;
grant execute on function billing_summary(uuid)                                                  to service_role;
grant execute on function admin_overview()                                                       to service_role;

-- ---------- realtime: let a signed-in user watch ONLY their own balance row ----------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'credit_accounts') then
    alter publication supabase_realtime add table credit_accounts;
  end if;
end $$;
