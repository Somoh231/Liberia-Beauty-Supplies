"use client";

import {
  addWeeklyProductSaleAction,
  addWeeklyServiceSaleAction,
  addWeeklySpacePaymentAction,
  updateWeeklyReportHeaderAction,
} from "@/app/actions/admin-weekly-sales-log";
import type {
  InventoryProductRow,
  MoneyBag,
  WeeklyProductSaleRow,
  WeeklySalesReportRow,
  WeeklyServiceSaleRow,
  WeeklySpacePaymentRow,
} from "@/lib/admin/salon-queries";
import { formatSalonMoney, type SalonCurrency } from "@/lib/admin/salon-format";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

const field =
  "mt-1.5 w-full rounded-xl border border-white/12 bg-black/30 px-3 py-3 text-sm text-white placeholder:text-white/35 focus:border-[var(--admin-accent)]/45 focus:outline-none focus:ring-1 focus:ring-[var(--admin-accent)]/30";

function formatBagLines(b: MoneyBag) {
  const lines: { cur: SalonCurrency; v: number }[] = [];
  (["NGN", "USD", "LRD"] as const).forEach((cur) => {
    if (b[cur]) lines.push({ cur, v: b[cur] });
  });
  return lines;
}

function MoneyBagSummary({ title, bag }: { title: string; bag: MoneyBag }) {
  const lines = formatBagLines(bag);
  return (
    <div className="rounded-xl border border-white/[0.08] bg-black/25 px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/45">{title}</p>
      {lines.length === 0 ? (
        <p className="mt-1 text-sm text-white/40">—</p>
      ) : (
        <div className="mt-2 space-y-1">
          {lines.map(({ cur, v }) => (
            <p key={cur} className="text-lg font-medium text-white">
              {formatSalonMoney(v, cur)}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

export function WeeklySalesLogDetail({
  report,
  products,
  services,
  spaces,
  inventory,
  summary,
}: {
  report: WeeklySalesReportRow;
  products: WeeklyProductSaleRow[];
  services: WeeklyServiceSaleRow[];
  spaces: WeeklySpacePaymentRow[];
  inventory: InventoryProductRow[];
  summary: {
    productSales: MoneyBag;
    serviceRevenue: MoneyBag;
    spacePayments: MoneyBag;
    grandTotal: MoneyBag;
  };
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const invById = useMemo(() => Object.fromEntries(inventory.map((i) => [i.id, i])), [inventory]);

  const [hdrStart, setHdrStart] = useState(report.start_date);
  const [hdrEnd, setHdrEnd] = useState(report.end_date);
  const [hdrStaff, setHdrStaff] = useState(report.staff_on_duty ?? "");

  const [pDay, setPDay] = useState(report.start_date);
  const [pItem, setPItem] = useState(inventory[0]?.id ?? "");
  const [pQty, setPQty] = useState("1");
  const [pPrice, setPPrice] = useState("");
  const [pPay, setPPay] = useState("");
  const [pStaff, setPStaff] = useState("");

  const linePreview = useMemo(() => {
    const q = Number(pQty);
    const up = Number(String(pPrice).replace(/,/g, ""));
    if (!Number.isFinite(q) || !Number.isFinite(up) || q <= 0 || up < 0) return null;
    return Math.round(q * up * 100);
  }, [pQty, pPrice]);

  const [sDay, setSDay] = useState(report.start_date);
  const [sName, setSName] = useState("");
  const [sStylist, setSStylist] = useState("");
  const [sClient, setSClient] = useState("");
  const [sAmt, setSAmt] = useState("");
  const [sPay, setSPay] = useState("");
  const [sNotes, setSNotes] = useState("");

  const [spStylist, setSpStylist] = useState("");
  const [spSpace, setSpSpace] = useState("");
  const [spWeek, setSpWeek] = useState("");
  const [spPaid, setSpPaid] = useState("");
  const [spBal, setSpBal] = useState("");
  const [spPay, setSpPay] = useState("");

  return (
    <div className="space-y-10 pb-12">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <Link
          href="/admin/sales-log"
          className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--admin-accent)]"
        >
          ← Weekly reports
        </Link>
      </div>

      <header className="space-y-2">
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-medium text-white">Weekly sales log</h1>
        <p className="text-sm text-white/50">
          {report.start_date} → {report.end_date}
        </p>
      </header>

      <section className="admin-card space-y-4 p-6">
        <h2 className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/45">Weekly header</h2>
        {err ? <p className="text-sm text-red-300">{err}</p> : null}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <label className="block text-xs text-white/55">
            Start date
            <input type="date" value={hdrStart} onChange={(e) => setHdrStart(e.target.value)} className={field} />
          </label>
          <label className="block text-xs text-white/55">
            End date
            <input type="date" value={hdrEnd} onChange={(e) => setHdrEnd(e.target.value)} className={field} />
          </label>
          <label className="block text-xs text-white/55 sm:col-span-2 lg:col-span-1">
            Staff on duty
            <input value={hdrStaff} onChange={(e) => setHdrStaff(e.target.value)} className={field} placeholder="Names" />
          </label>
        </div>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            setErr(null);
            start(async () => {
              const r = await updateWeeklyReportHeaderAction({
                id: report.id,
                startDate: hdrStart,
                endDate: hdrEnd,
                staffOnDuty: hdrStaff || null,
              });
              if (!r.ok) {
                setErr(r.error);
                return;
              }
              router.refresh();
            });
          }}
          className="rounded-full border border-white/18 px-5 py-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/90 disabled:opacity-50"
        >
          Save header
        </button>
      </section>

      <div className="grid gap-8 lg:grid-cols-2">
        <section className="admin-card space-y-4 p-6">
          <h2 className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/45">Product sales</h2>
          <p className="text-xs text-white/40">Saving a line records the sale and reduces inventory. Default currency NGN.</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-xs text-white/55">
              Day
              <input type="date" value={pDay} min={report.start_date} max={report.end_date} onChange={(e) => setPDay(e.target.value)} className={field} />
            </label>
            <label className="block text-xs text-white/55 sm:col-span-2">
              Product
              <select value={pItem} onChange={(e) => setPItem(e.target.value)} className={field}>
                {inventory.length === 0 ? <option value="">No products</option> : null}
                {inventory.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.product_code} · {i.product_name} (qty {i.quantity_on_hand})
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs text-white/55">
              Qty sold
              <input value={pQty} onChange={(e) => setPQty(e.target.value)} className={field} inputMode="decimal" />
            </label>
            <label className="block text-xs text-white/55">
              Unit price (NGN)
              <input value={pPrice} onChange={(e) => setPPrice(e.target.value)} className={field} inputMode="decimal" />
            </label>
            <p className="sm:col-span-2 text-xs text-white/50">
              Line total:{" "}
              {linePreview != null ? (
                <span className="font-semibold text-[var(--admin-accent)]">{formatSalonMoney(linePreview, "NGN")}</span>
              ) : (
                "—"
              )}
            </p>
            <label className="block text-xs text-white/55">
              Payment method
              <input value={pPay} onChange={(e) => setPPay(e.target.value)} className={field} placeholder="Cash, transfer…" />
            </label>
            <label className="block text-xs text-white/55">
              Staff name
              <input value={pStaff} onChange={(e) => setPStaff(e.target.value)} className={field} />
            </label>
          </div>
          <button
            type="button"
            disabled={pending || !pItem}
            onClick={() => {
              setErr(null);
              start(async () => {
                const r = await addWeeklyProductSaleAction({
                  reportId: report.id,
                  dayDate: pDay,
                  inventoryItemId: pItem,
                  qtySold: pQty,
                  unitPriceMajor: pPrice,
                  paymentMethod: pPay || null,
                  staffName: pStaff || null,
                  currency: "NGN",
                });
                if (!r.ok) {
                  setErr(r.error.replace(/_/g, " "));
                  return;
                }
                setPQty("1");
                setPPrice("");
                setPPay("");
                setPStaff("");
                router.refresh();
              });
            }}
            className="rounded-full bg-[var(--admin-accent)] px-5 py-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-black disabled:opacity-50"
          >
            Add product line
          </button>

          <div className="overflow-x-auto border-t border-white/10 pt-4">
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead>
                <tr className="border-b border-white/10 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">
                  <th className="py-2 pr-2">Day</th>
                  <th className="py-2 pr-2">Product</th>
                  <th className="py-2 pr-2">Qty</th>
                  <th className="py-2 pr-2">Total</th>
                  <th className="py-2">Staff</th>
                </tr>
              </thead>
              <tbody>
                {products.map((row) => {
                  const inv = invById[row.inventory_item_id];
                  return (
                    <tr key={row.id} className="border-b border-white/[0.06] text-white/80">
                      <td className="py-2 pr-2">{row.day_date}</td>
                      <td className="py-2 pr-2 text-white">
                        {inv ? `${inv.product_code} · ${inv.product_name}` : row.inventory_item_id.slice(0, 8)}
                      </td>
                      <td className="py-2 pr-2">{row.qty_sold}</td>
                      <td className="py-2 pr-2">{formatSalonMoney(row.line_total_minor, row.currency)}</td>
                      <td className="py-2 text-white/55">{row.staff_name ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {products.length === 0 ? <p className="py-4 text-sm text-white/40">No product lines yet.</p> : null}
          </div>
        </section>

        <section className="admin-card space-y-4 p-6">
          <h2 className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/45">Services</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-xs text-white/55">
              Day
              <input type="date" value={sDay} min={report.start_date} max={report.end_date} onChange={(e) => setSDay(e.target.value)} className={field} />
            </label>
            <label className="block text-xs text-white/55 sm:col-span-2">
              Service
              <input value={sName} onChange={(e) => setSName(e.target.value)} className={field} placeholder="e.g. Braids" />
            </label>
            <label className="block text-xs text-white/55">
              Stylist name
              <input value={sStylist} onChange={(e) => setSStylist(e.target.value)} className={field} />
            </label>
            <label className="block text-xs text-white/55">
              Client name
              <input value={sClient} onChange={(e) => setSClient(e.target.value)} className={field} />
            </label>
            <label className="block text-xs text-white/55">
              Amount (NGN)
              <input value={sAmt} onChange={(e) => setSAmt(e.target.value)} className={field} inputMode="decimal" />
            </label>
            <label className="block text-xs text-white/55">
              Payment method
              <input value={sPay} onChange={(e) => setSPay(e.target.value)} className={field} />
            </label>
            <label className="block text-xs text-white/55 sm:col-span-2">
              Notes
              <input value={sNotes} onChange={(e) => setSNotes(e.target.value)} className={field} />
            </label>
          </div>
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              setErr(null);
              start(async () => {
                const r = await addWeeklyServiceSaleAction({
                  reportId: report.id,
                  dayDate: sDay,
                  serviceName: sName,
                  stylistName: sStylist || null,
                  clientName: sClient || null,
                  amountMajor: sAmt,
                  paymentMethod: sPay || null,
                  notes: sNotes || null,
                  currency: "NGN",
                });
                if (!r.ok) {
                  setErr(r.error.replace(/_/g, " "));
                  return;
                }
                setSName("");
                setSStylist("");
                setSClient("");
                setSAmt("");
                setSPay("");
                setSNotes("");
                router.refresh();
              });
            }}
            className="rounded-full bg-[var(--admin-accent)] px-5 py-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-black disabled:opacity-50"
          >
            Add service line
          </button>

          <div className="overflow-x-auto border-t border-white/10 pt-4">
            <table className="w-full min-w-[480px] text-left text-sm">
              <thead>
                <tr className="border-b border-white/10 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">
                  <th className="py-2 pr-2">Day</th>
                  <th className="py-2 pr-2">Service</th>
                  <th className="py-2 pr-2">Stylist</th>
                  <th className="py-2 pr-2">Client</th>
                  <th className="py-2">Amount</th>
                </tr>
              </thead>
              <tbody>
                {services.map((row) => (
                  <tr key={row.id} className="border-b border-white/[0.06] text-white/80">
                    <td className="py-2 pr-2">{row.day_date}</td>
                    <td className="py-2 pr-2 text-white">{row.service_name}</td>
                    <td className="py-2 pr-2">{row.stylist_name ?? "—"}</td>
                    <td className="py-2 pr-2">{row.client_name ?? "—"}</td>
                    <td className="py-2">{formatSalonMoney(row.amount_minor, row.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {services.length === 0 ? <p className="py-4 text-sm text-white/40">No services yet.</p> : null}
          </div>
        </section>
      </div>

      <section className="admin-card space-y-4 p-6">
        <h2 className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/45">Stylist space payments</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <label className="block text-xs text-white/55">
            Stylist name
            <input value={spStylist} onChange={(e) => setSpStylist(e.target.value)} className={field} />
          </label>
          <label className="block text-xs text-white/55">
            Space number
            <input value={spSpace} onChange={(e) => setSpSpace(e.target.value)} className={field} />
          </label>
          <label className="block text-xs text-white/55">
            Week period
            <input value={spWeek} onChange={(e) => setSpWeek(e.target.value)} className={field} placeholder="e.g. Apr 14–20" />
          </label>
          <label className="block text-xs text-white/55">
            Amount paid (NGN)
            <input value={spPaid} onChange={(e) => setSpPaid(e.target.value)} className={field} inputMode="decimal" />
          </label>
          <label className="block text-xs text-white/55">
            Balance due (NGN)
            <input value={spBal} onChange={(e) => setSpBal(e.target.value)} className={field} inputMode="decimal" />
          </label>
          <label className="block text-xs text-white/55">
            Payment method
            <input value={spPay} onChange={(e) => setSpPay(e.target.value)} className={field} />
          </label>
        </div>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            setErr(null);
            start(async () => {
              const r = await addWeeklySpacePaymentAction({
                reportId: report.id,
                stylistName: spStylist,
                spaceNumber: spSpace || null,
                weekPeriod: spWeek || null,
                amountPaidMajor: spPaid || "0",
                balanceDueMajor: spBal || "0",
                paymentMethod: spPay || null,
                currency: "NGN",
              });
              if (!r.ok) {
                setErr(r.error.replace(/_/g, " "));
                return;
              }
              setSpStylist("");
              setSpSpace("");
              setSpWeek("");
              setSpPaid("");
              setSpBal("");
              setSpPay("");
              router.refresh();
            });
          }}
          className="rounded-full bg-[var(--admin-accent)] px-5 py-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-black disabled:opacity-50"
        >
          Add space payment
        </button>

        <div className="overflow-x-auto border-t border-white/10 pt-4">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">
                <th className="py-2 pr-2">Stylist</th>
                <th className="py-2 pr-2">Space</th>
                <th className="py-2 pr-2">Week</th>
                <th className="py-2 pr-2">Paid</th>
                <th className="py-2">Balance</th>
              </tr>
            </thead>
            <tbody>
              {spaces.map((row) => (
                <tr key={row.id} className="border-b border-white/[0.06] text-white/80">
                  <td className="py-2 pr-2 text-white">{row.stylist_name}</td>
                  <td className="py-2 pr-2">{row.space_number ?? "—"}</td>
                  <td className="py-2 pr-2">{row.week_period ?? "—"}</td>
                  <td className="py-2 pr-2">{formatSalonMoney(row.amount_paid_minor, row.currency)}</td>
                  <td className="py-2">{formatSalonMoney(row.balance_due_minor, row.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {spaces.length === 0 ? <p className="py-4 text-sm text-white/40">No space payments yet.</p> : null}
        </div>
      </section>

      <section className="admin-card space-y-4 p-6">
        <h2 className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/45">Report summary</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MoneyBagSummary title="Total product sales" bag={summary.productSales} />
          <MoneyBagSummary title="Total service revenue" bag={summary.serviceRevenue} />
          <MoneyBagSummary title="Total space payments" bag={summary.spacePayments} />
          <MoneyBagSummary title="Grand total" bag={summary.grandTotal} />
        </div>
      </section>
    </div>
  );
}
