-- FX/WAC documentation hardening (no behavioral schema change)
-- Reinforces: settings-driven FX baselines; WAC canonical in USD; FX changes do not rewrite history.

comment on column public.inventory_items.weighted_avg_landed_usd_cents is
  'Canonical WAC in USD cents. NGN/LRD inputs convert to USD at purchase/receipt using operational FX then in effect. Later FX changes do not rewrite historical WAC unless an explicit admin recalculation runs. Used for sale GP and valuation.';

comment on column public.inventory_items.fx_ngn_per_usd is
  'Optional item-level NGN per 1 USD for NGN cost conversion. When null, runtime uses operational_settings via operational_ngn_per_usd() (baseline seed 1385).';

comment on function public.operational_ngn_per_usd() is
  'Operational NGN per 1 USD from operational_settings when set (>0); else seed/fallback 1385. Runtime sale/purchase/WAC SQL paths must use this — not silent literals.';

comment on function public.operational_lrd_per_usd() is
  'Operational LRD per 1 USD from operational_settings when set (>0); else seed/fallback 190. Minor-unit FX is major-per-major (no extra ×100).';

-- Ensure singleton settings row carries seeded baselines when rates were never set
update public.operational_settings
set
  ngn_per_usd = coalesce(nullif(ngn_per_usd, 0), 1385),
  lrd_per_usd = coalesce(nullif(lrd_per_usd, 0), 190)
where id = 1;
