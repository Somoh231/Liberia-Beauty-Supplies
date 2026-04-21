import type { Metadata } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { fetchDashboardRollup, type MoneyBag } from "@/lib/admin/salon-queries";
import { formatSalonMoney, getMonroviaDayKey, type SalonCurrency } from "@/lib/admin/salon-format";
import Link from "next/link";

export const metadata: Metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

function emptyBag(): MoneyBag {
  return { USD: 0, LRD: 0, NGN: 0 };
}

function moneyLines(bag: MoneyBag, primary: SalonCurrency = "NGN") {
  const order = [...new Set<SalonCurrency>([primary, "USD", "LRD"])];
  const lines = order.map((c) => ({ c, v: bag[c] })).filter(({ v }) => v > 0);
  if (!lines.length) {
    return <p className="text-lg text-white/40">—</p>;
  }
  return (
    <div className="space-y-1">
      {lines.map(({ c, v }) => (
        <p key={c} className={c === primary ? "text-lg text-white" : "text-sm text-white/55"}>
          {formatSalonMoney(v, c)}
        </p>
      ))}
    </div>
  );
}

function sumLastDays(
  productMap: Record<string, MoneyBag>,
  serviceMap: Record<string, MoneyBag>,
  profitMap: Record<string, MoneyBag>,
  days: number,
) {
  const out = {
    product: emptyBag(),
    service: emptyBag(),
    profit: emptyBag(),
  };
  const today = new Date();
  for (let i = 0; i < days; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = getMonroviaDayKey(d);
    const p = productMap[key] ?? emptyBag();
    const s = serviceMap[key] ?? emptyBag();
    const g = profitMap[key] ?? emptyBag();
    (["USD", "LRD", "NGN"] as const).forEach((c) => {
      out.product[c] += p[c];
      out.service[c] += s[c];
      out.profit[c] += g[c];
    });
  }
  return out;
}

export default async function AdminDashboardPage() {
  let err: string | null = null;
  let rollup: Awaited<ReturnType<typeof fetchDashboardRollup>> | null = null;

  try {
    const supabase = await createSupabaseServerClient();
    rollup = await fetchDashboardRollup(supabase);
  } catch (e) {
    err = e instanceof Error ? e.message : "Could not load dashboard.";
  }

  const todayKey = getMonroviaDayKey();
  const todayProduct = rollup ? (rollup.productRevenueByDay[todayKey] ?? emptyBag()) : emptyBag();
  const todayService = rollup ? (rollup.serviceRevenueByDay[todayKey] ?? emptyBag()) : emptyBag();
  const todayProfit = rollup ? (rollup.productGrossProfitByDay[todayKey] ?? emptyBag()) : emptyBag();

  const w7 = rollup ? sumLastDays(rollup.productRevenueByDay, rollup.serviceRevenueByDay, rollup.productGrossProfitByDay, 7) : null;
  const m30 = rollup?.totalsLast30 ?? null;

  const est = emptyBag();
  if (m30) {
    (["USD", "LRD", "NGN"] as const).forEach((c) => {
      est[c] = m30.productGrossProfit[c] + m30.serviceRevenue[c];
    });
  }

  const inv = rollup?.inventoryValueByCurrency ?? emptyBag();

  return (
    <div className="mx-auto max-w-6xl space-y-8 pb-10">
      <header className="space-y-2">
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-medium tracking-tight text-white sm:text-4xl">
          Salon overview
        </h1>
        <p className="max-w-2xl text-sm text-white/50">
          Sales, services, and stock move together. Daily totals use Monrovia dates; NGN is shown first when present.
        </p>
      </header>

      {err ? (
        <section className="admin-card border border-red-500/25 bg-red-500/[0.08] p-6">
          <p className="text-sm text-red-100/90">{err}</p>
          <p className="mt-2 text-xs text-red-100/60">
            Run the latest Supabase migrations for salon inventory and weekly sales (see <code className="rounded bg-black/30 px-1">web/supabase/migrations</code>
            ).
          </p>
        </section>
      ) : rollup ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="admin-card p-5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/45">Today · products</p>
              <div className="mt-2">{moneyLines(todayProduct)}</div>
            </div>
            <div className="admin-card p-5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/45">Today · services</p>
              <div className="mt-2">{moneyLines(todayService)}</div>
            </div>
            <div className="admin-card p-5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/45">Today · product profit</p>
              <div className="mt-2">{moneyLines(todayProfit)}</div>
            </div>
            <div className="admin-card p-5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/45">Low stock SKUs</p>
              <p className="mt-2 font-[family-name:var(--font-display)] text-3xl text-white">{rollup.lowStockCount}</p>
              <Link href="/admin/inventory" className="mt-2 inline-block text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--admin-accent)]">
                View inventory →
              </Link>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="admin-card p-6">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/45">Last 7 days (Monrovia)</p>
              <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <p className="text-white/45">Product sales</p>
                  <div className="mt-1">{moneyLines(w7!.product)}</div>
                </div>
                <div>
                  <p className="text-white/45">Service revenue</p>
                  <div className="mt-1">{moneyLines(w7!.service)}</div>
                </div>
                <div className="sm:col-span-2">
                  <p className="text-white/45">Product gross profit (7d)</p>
                  <div className="mt-1">{moneyLines(w7!.profit)}</div>
                </div>
              </div>
            </section>

            <section className="admin-card p-6">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/45">Last 30 days</p>
              <div className="mt-4 space-y-3 text-sm">
                <div className="flex justify-between gap-4 border-b border-white/8 pb-2">
                  <span className="text-white/45">Product revenue</span>
                  <div className="text-right">{moneyLines(m30!.productRevenue)}</div>
                </div>
                <div className="flex justify-between gap-4 border-b border-white/8 pb-2">
                  <span className="text-white/45">Service revenue</span>
                  <div className="text-right">{moneyLines(m30!.serviceRevenue)}</div>
                </div>
                <div className="flex justify-between gap-4 border-b border-white/8 pb-2">
                  <span className="text-white/45">Product gross profit</span>
                  <div className="text-right">{moneyLines(m30!.productGrossProfit)}</div>
                </div>
                <div className="flex justify-between gap-4 pt-1">
                  <span className="text-white/55">Est. total contribution (30d)</span>
                  <div className="text-right font-medium text-[var(--admin-accent)]">{moneyLines(est)}</div>
                </div>
                <p className="text-[11px] leading-relaxed text-white/35">
                  Contribution = product gross profit + service revenue (service COGS not auto-deducted unless you add product usage on each service log).
                </p>
              </div>
            </section>
          </div>

          <section className="admin-card p-6">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/45">Inventory value (on hand × avg cost)</p>
            <div className="mt-3 grid gap-6 text-sm sm:grid-cols-3">
              <div>
                <p className="text-white/45">NGN</p>
                <p className="text-xl text-white">{formatSalonMoney(inv.NGN, "NGN")}</p>
              </div>
              <div>
                <p className="text-white/45">USD</p>
                <p className="text-xl text-white">{formatSalonMoney(inv.USD, "USD")}</p>
              </div>
              <div>
                <p className="text-white/45">LRD</p>
                <p className="text-xl text-white">{formatSalonMoney(inv.LRD, "LRD")}</p>
              </div>
            </div>
          </section>

          <div className="flex flex-wrap gap-2">
            <Link
              href="/admin/sales-log"
              className="rounded-full bg-[var(--admin-accent)] px-5 py-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-black"
            >
              Weekly sales log
            </Link>
            <Link
              href="/admin/sales/new"
              className="rounded-full border border-white/18 px-5 py-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/85"
            >
              Record product sale
            </Link>
            <Link
              href="/admin/services/new"
              className="rounded-full border border-white/18 px-5 py-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/85"
            >
              Log service
            </Link>
            <Link
              href="/admin/purchases/new"
              className="rounded-full border border-white/18 px-5 py-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/85"
            >
              New purchase
            </Link>
          </div>
        </>
      ) : null}
    </div>
  );
}
