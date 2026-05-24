import {
  convertUsdCentsToLrdCents,
  ngnKoboToUsdCents,
  type OperationalFxRates,
} from "@/lib/admin/pricing-engine";

/** Derive USD/LRD retail cents from NGN major retail using operational FX (pricing-engine). */
export function deriveRetailFromNgnMajor(
  retailNgnMajor: number,
  fx: OperationalFxRates,
): { retailNgnCents: number; sellUsdCents: number; sellLrdCents: number } {
  const retailNgnCents = Math.round(retailNgnMajor * 100);
  const sellUsdCents = ngnKoboToUsdCents(retailNgnCents, fx.ngnPerUsd);
  const sellLrdCents = convertUsdCentsToLrdCents(sellUsdCents, fx.lrdPerUsd);
  return { retailNgnCents, sellUsdCents, sellLrdCents };
}
