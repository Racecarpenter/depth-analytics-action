-- =============================================================================
-- Beta paywall credits.
--
-- Changes what a 'beta_unlimited' entitlement (0015_beta_entitlements.sql)
-- actually does. Before this migration it bypassed Action-creation
-- entitlement checks entirely — a beta tester could never run out. That
-- defeats the actual point of a beta: observing whether the paywall,
-- pricing, and credit system make sense to real users. From here on, beta
-- testers draw down credits and hit the paywall exactly like anyone else;
-- what beta access grants instead is *eligibility* for a repeatable,
-- server-enforced free "+N Actions" grant once their balance genuinely
-- reaches zero — exercising the same ledger/entitlement architecture a real
-- Stripe purchase will eventually use, without Stripe or real money
-- involved.
--
-- The user_entitlements row and entitlement_type value ('beta_unlimited')
-- that identify who's an authorized beta tester are UNCHANGED here —
-- grant_beta_access / revoke_beta_access / list_beta_testers (all in
-- 0015_beta_entitlements.sql) keep working exactly as documented in README
-- ("Beta testing access"). Renaming that label wasn't worth the churn for
-- something that's still fundamentally "is this person an authorized beta
-- tester" — only what that identity *means* to Action creation changes.
-- =============================================================================

-- amount_sign_matches_type must recognize the new type (added in
-- 0017_beta_grant_credit_type.sql) before anything can insert a
-- 'beta_grant' row — same family as starter_grant/referral_reward/
-- action_pack_purchase: always a positive amount.
alter table action_credit_transactions drop constraint amount_sign_matches_type;
alter table action_credit_transactions add constraint amount_sign_matches_type check (
  (type in ('starter_grant', 'referral_reward', 'action_pack_purchase', 'beta_grant') and amount > 0)
  or (type = 'action_created' and amount < 0)
  or (type = 'admin_adjustment')
);

-- -----------------------------------------------------------------------------
-- consume_action_credit_or_pass: drop the beta_unlimited bypass. Beta
-- testers now go straight to the pass/credit/deny checks below, identical
-- to every other user — this function no longer even queries
-- user_entitlements.
-- -----------------------------------------------------------------------------

create or replace function consume_action_credit_or_pass(
  p_user_id uuid,
  p_action_id uuid,
  p_amount integer default 1
)
returns table(allowed boolean, method text, balance_after integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_has_pass boolean;
  v_balance integer;
begin
  if p_amount <= 0 then
    raise exception 'p_amount must be positive';
  end if;

  perform pg_advisory_xact_lock(hashtext('credit:' || p_user_id::text));

  select exists(
    select 1 from action_passes
    where user_id = p_user_id and expires_at > now()
  ) into v_has_pass;

  if v_has_pass then
    return query select true, 'pass'::text, null::integer;
    return;
  end if;

  select coalesce(sum(amount), 0) into v_balance
  from action_credit_transactions
  where user_id = p_user_id;

  if v_balance >= p_amount then
    insert into action_credit_transactions (user_id, type, amount, reference_type, reference_id, note)
    values (p_user_id, 'action_created', -p_amount, 'action', p_action_id, 'Action created');

    return query select true, 'credit'::text, (v_balance - p_amount);
    return;
  end if;

  return query select false, 'denied'::text, v_balance;
end;
$$;

-- -----------------------------------------------------------------------------
-- grant_beta_paywall_credits
-- The ONLY way a 'beta_grant' ledger row is ever inserted. Re-derives every
-- eligibility condition itself rather than trusting the caller — same
-- posture as consume_action_credit_or_pass and every other SECURITY DEFINER
-- function in this schema:
--   1. caller has an active, unexpired beta_unlimited entitlement
--   2. caller has no active Pass (nothing to gain from more credits)
--   3. caller's current balance is <= 0
-- A client (or a compromised/buggy application layer) calling this without
-- all three holding gets a clean {granted: false, reason: ...} back, never
-- credits. Condition 3 is also the natural repeat-purchase throttle the
-- product spec asked for: the instant a grant succeeds, balance is
-- positive again, so an immediate second call is rejected without needing
-- a separate cooldown/lock table — the same advisory lock
-- consume_action_credit_or_pass takes prevents a grant and a concurrent
-- Action creation from racing each other's balance read.
-- -----------------------------------------------------------------------------

create or replace function grant_beta_paywall_credits(
  p_user_id uuid,
  p_amount integer default 5
)
returns table(granted boolean, reason text, balance_after integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_has_beta boolean;
  v_has_pass boolean;
  v_balance integer;
  v_tx_id uuid;
begin
  if p_amount <= 0 then
    raise exception 'p_amount must be positive';
  end if;

  perform pg_advisory_xact_lock(hashtext('credit:' || p_user_id::text));

  select exists(
    select 1 from user_entitlements
    where user_id = p_user_id
      and entitlement_type = 'beta_unlimited'
      and revoked_at is null
      and starts_at <= now()
      and (expires_at is null or expires_at > now())
  ) into v_has_beta;

  if not v_has_beta then
    return query select false, 'not_beta_tester'::text, null::integer;
    return;
  end if;

  select exists(
    select 1 from action_passes
    where user_id = p_user_id and expires_at > now()
  ) into v_has_pass;

  if v_has_pass then
    return query select false, 'has_active_pass'::text, null::integer;
    return;
  end if;

  select coalesce(sum(amount), 0) into v_balance
  from action_credit_transactions
  where user_id = p_user_id;

  if v_balance > 0 then
    return query select false, 'balance_positive'::text, v_balance;
    return;
  end if;

  -- reference_type/note carry the "source" + "quantity" detail the ledger
  -- table has no dedicated metadata column for (action_credit_transactions
  -- is deliberately minimal — see 0005_monetization.sql). The richer
  -- structured record — {source: "beta_paywall", quantity: p_amount} — is
  -- also logged to analytics_events (which does have a jsonb metadata
  -- column) by the calling application code right after this succeeds; see
  -- src/features/monetization/beta-mutations.ts.
  insert into action_credit_transactions (user_id, type, amount, reference_type, note)
  values (
    p_user_id,
    'beta_grant',
    p_amount,
    'beta_paywall',
    'Beta paywall grant: +' || p_amount || ' Actions (source=beta_paywall)'
  )
  returning id into v_tx_id;

  return query select true, 'granted'::text, (v_balance + p_amount);
end;
$$;

-- Same posture as consume_action_credit_or_pass: trusts p_user_id
-- completely, so it must never be reachable from the browser — only from
-- server code via the service-role client.
revoke execute on function grant_beta_paywall_credits(uuid, integer) from public;
grant execute on function grant_beta_paywall_credits(uuid, integer) to service_role;
