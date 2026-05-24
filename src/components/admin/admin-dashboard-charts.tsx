"use client";

import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatSalonMoney } from "@/lib/admin/salon-format";

const GOLD = "#d4af37";
const GOLD_DIM = "rgba(212, 175, 55, 0.35)";
const RETAIL = "#c9a961";
const SERVICE = "rgba(255, 255, 255, 0.55)";
const MUTED = "rgba(255, 255, 255, 0.28)";

export type DashboardChartsPayload = {
  revenueTrend: { day: string; retail: number; service: number }[];
  grossProfitTrend: { day: string; gp: number }[];
  topProductsByQty: { name: string; qty: number }[];
  serviceMix: { category: string; revenueUsdCents: number }[];
  inventoryHealth: { in_stock: number; low_stock: number; out_of_stock: number };
};

function usdTick(v: number) {
  if (v >= 100_000) return `$${(v / 100_000).toFixed(1)}k`;
  if (v >= 1000) return `$${(v / 100).toFixed(0)}`;
  return formatSalonMoney(v, "USD");
}

export function AdminDashboardCharts({ data }: { data: DashboardChartsPayload }) {
  const [revenueDays, setRevenueDays] = useState<14 | 30>(14);
  const revenueSlice = useMemo(
    () =>
      revenueDays === 14 ? data.revenueTrend.slice(-14) : data.revenueTrend.slice(-30),
    [data.revenueTrend, revenueDays],
  );

  const gpSlice = useMemo(() => data.grossProfitTrend.slice(-30), [data.grossProfitTrend]);

  const barData = useMemo(
    () =>
      data.topProductsByQty.slice(0, 6).map((p) => ({
        name: p.name.length > 22 ? `${p.name.slice(0, 20)}…` : p.name,
        fullName: p.name,
        qty: p.qty,
      })),
    [data.topProductsByQty],
  );

  const pieData = useMemo(() => {
    const rows = data.serviceMix.filter((r) => r.revenueUsdCents > 0);
    if (rows.length === 0) return [{ category: "No data", revenueUsdCents: 1 }];
    return rows.map((r) => ({
      name: r.category.length > 18 ? `${r.category.slice(0, 16)}…` : r.category,
      fullName: r.category,
      value: r.revenueUsdCents,
    }));
  }, [data.serviceMix]);

  const COLORS = [GOLD, RETAIL, SERVICE, "#a67c52", "#6b8f71", "#7a6b8f"];

  const invTotal =
    data.inventoryHealth.in_stock + data.inventoryHealth.low_stock + data.inventoryHealth.out_of_stock;
  const invPie = [
    { name: "In stock", value: data.inventoryHealth.in_stock, color: "#6b8f71" },
    { name: "Low", value: data.inventoryHealth.low_stock, color: GOLD },
    { name: "Out", value: data.inventoryHealth.out_of_stock, color: "#b94a48" },
  ].filter((x) => x.value > 0);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="admin-card p-5 sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/45">Revenue trend</h2>
          <div className="flex rounded-full border border-white/10 p-0.5">
            {([14, 30] as const).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setRevenueDays(d)}
                className={`rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${
                  revenueDays === d ? "bg-white/10 text-[var(--admin-accent)]" : "text-white/45"
                }`}
              >
                {d}d
              </button>
            ))}
          </div>
        </div>
        <p className="mt-1 text-[11px] text-white/35">Retail vs services (USD equivalent)</p>
        <div className="mt-4 h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={revenueSlice} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={MUTED} />
              <XAxis dataKey="day" tick={{ fill: "rgba(255,255,255,0.35)", fontSize: 10 }} tickFormatter={(d) => String(d).slice(5)} />
              <YAxis tick={{ fill: "rgba(255,255,255,0.35)", fontSize: 10 }} tickFormatter={usdTick} width={44} />
              <Tooltip
                contentStyle={{
                  background: "rgba(12, 12, 14, 0.94)",
                  border: "1px solid rgba(212, 175, 55, 0.25)",
                  borderRadius: 12,
                  fontSize: 12,
                }}
                labelStyle={{ color: GOLD }}
                formatter={(val: number, name: string) => [formatSalonMoney(val, "USD"), name === "retail" ? "Retail" : "Services"]}
              />
              <Legend formatter={(v) => (v === "retail" ? "Retail" : "Services")} wrapperStyle={{ fontSize: 10 }} />
              <Line type="monotone" dataKey="retail" name="retail" stroke={RETAIL} strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="service" name="service" stroke={SERVICE} strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="admin-card p-5 sm:p-6">
        <h2 className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/45">Gross profit (30d)</h2>
        <p className="mt-1 text-[11px] text-white/35">Retail gross profit — USD equivalent</p>
        <div className="mt-4 h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={gpSlice} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="gpFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={GOLD} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={GOLD} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={MUTED} />
              <XAxis dataKey="day" tick={{ fill: "rgba(255,255,255,0.35)", fontSize: 10 }} tickFormatter={(d) => String(d).slice(5)} />
              <YAxis tick={{ fill: "rgba(255,255,255,0.35)", fontSize: 10 }} tickFormatter={usdTick} width={44} />
              <Tooltip
                contentStyle={{
                  background: "rgba(12, 12, 14, 0.94)",
                  border: `1px solid ${GOLD_DIM}`,
                  borderRadius: 12,
                  fontSize: 12,
                }}
                formatter={(val: number) => formatSalonMoney(val, "USD")}
              />
              <Area type="monotone" dataKey="gp" stroke={GOLD} fill="url(#gpFill)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="admin-card p-5 sm:p-6">
        <h2 className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/45">Top products (qty)</h2>
        <p className="mt-1 text-[11px] text-white/35">Last 30 days</p>
        <div className="mt-4 h-56 w-full">
          {barData.length === 0 ? (
            <p className="py-12 text-center text-sm text-white/40">No retail sales in period.</p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart layout="vertical" data={barData} margin={{ top: 4, right: 16, left: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={MUTED} horizontal={false} />
                <XAxis type="number" tick={{ fill: "rgba(255,255,255,0.35)", fontSize: 10 }} />
                <YAxis type="category" dataKey="name" width={100} tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 10 }} />
                <Tooltip
                  contentStyle={{
                    background: "rgba(12, 12, 14, 0.94)",
                    border: `1px solid ${GOLD_DIM}`,
                    borderRadius: 12,
                    fontSize: 12,
                  }}
                  formatter={(v: number, _n, p) => [v, `${p.payload.fullName}`]}
                />
                <Bar dataKey="qty" radius={[0, 6, 6, 0]} fill={GOLD} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>

      <section className="admin-card p-5 sm:p-6">
        <h2 className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/45">Service mix (30d)</h2>
        <p className="mt-1 text-[11px] text-white/35">By category — USD equivalent</p>
        <div className="mt-4 flex h-56 flex-col items-center justify-center sm:flex-row sm:gap-4">
          <div className="h-48 w-full sm:w-1/2">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={48} outerRadius={72} paddingAngle={2}>
                  {pieData.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} stroke="rgba(0,0,0,0.2)" />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: "rgba(12, 12, 14, 0.94)",
                    border: `1px solid ${GOLD_DIM}`,
                    borderRadius: 12,
                    fontSize: 12,
                  }}
                  formatter={(val: number, _n, p) => [formatSalonMoney(val, "USD"), (p.payload as { fullName?: string }).fullName ?? ""]}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      <section className="admin-card p-5 sm:p-6 lg:col-span-2">
        <h2 className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/45">Inventory health</h2>
        <p className="mt-1 text-[11px] text-white/35">Active SKUs by stock status</p>
        <div className="mt-4 flex flex-col gap-6 sm:flex-row sm:items-center">
          <div className="h-52 w-full max-w-xs">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={invPie.length ? invPie : [{ name: "—", value: 1, color: MUTED }]}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={40}
                  outerRadius={70}
                  paddingAngle={2}
                >
                  {(invPie.length ? invPie : [{ name: "—", value: 1, color: MUTED }]).map((e, i) => (
                    <Cell key={i} fill={e.color} stroke="rgba(0,0,0,0.2)" />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: "rgba(12, 12, 14, 0.94)",
                    border: `1px solid ${GOLD_DIM}`,
                    borderRadius: 12,
                    fontSize: 12,
                  }}
                  formatter={(v: number) => [v, "SKUs"]}
                />
                <Legend formatter={(v) => `${v}`} wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="grid flex-1 grid-cols-3 gap-3 text-center sm:text-left">
            <div className="rounded-xl border border-white/[0.08] bg-black/20 p-4">
              <p className="text-[10px] uppercase tracking-[0.14em] text-emerald-200/70">In stock</p>
              <p className="mt-1 font-[family-name:var(--font-display)] text-2xl text-white">{data.inventoryHealth.in_stock}</p>
            </div>
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.06] p-4">
              <p className="text-[10px] uppercase tracking-[0.14em] text-amber-100/80">Low</p>
              <p className="mt-1 font-[family-name:var(--font-display)] text-2xl text-white">{data.inventoryHealth.low_stock}</p>
            </div>
            <div className="rounded-xl border border-red-500/25 bg-red-500/[0.06] p-4">
              <p className="text-[10px] uppercase tracking-[0.14em] text-red-100/80">Out</p>
              <p className="mt-1 font-[family-name:var(--font-display)] text-2xl text-white">{data.inventoryHealth.out_of_stock}</p>
            </div>
            {invTotal === 0 ? <p className="col-span-3 text-sm text-white/40">No active inventory rows.</p> : null}
          </div>
        </div>
      </section>
    </div>
  );
}
