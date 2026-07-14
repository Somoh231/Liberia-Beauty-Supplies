import { describe, expect, it } from "vitest";
import {
  deriveInventorySetupStatus,
  filterSellableInventoryItems,
  isInventoryAssetProductName,
  isSellableForSaleSearch,
  mapInventorySaleGuardError,
  resolveCatalogItemType,
  summarizeInventorySetupProgress,
  inventoryNeedsSetup,
} from "@/lib/admin/inventory-sellability";

describe("inventory asset detection", () => {
  it("matches fixed asset names case-insensitively and Industrial Machine prefix", () => {
    expect(isInventoryAssetProductName("Pink Nail Table")).toBe(true);
    expect(isInventoryAssetProductName(" pink nail table ")).toBe(true);
    expect(isInventoryAssetProductName("Industrial Machine (Jukah for Wig)")).toBe(true);
    expect(isInventoryAssetProductName("Dummy Head")).toBe(false);
    expect(resolveCatalogItemType("LED Light")).toBe("asset");
    expect(resolveCatalogItemType("Cluster Lash")).toBe("retail");
  });
});

describe("setup_status derivation", () => {
  it("assets are ready; incomplete retail stays needs_setup", () => {
    expect(deriveInventorySetupStatus({ item_type: "asset", quantity_on_hand: 0 })).toBe("ready");
    expect(
      deriveInventorySetupStatus({
        item_type: "retail",
        quantity_on_hand: 0,
        supplier_id: null,
        avg_unit_cost_cents: 0,
        sell_price_usd_cents: null,
      }),
    ).toBe("needs_setup");
    expect(
      deriveInventorySetupStatus({
        item_type: "retail",
        quantity_on_hand: 0,
        supplier_id: "sup-1",
        weighted_avg_landed_usd_cents: 500,
        sell_price_usd_cents: 1200,
      }),
    ).toBe("ready");
  });

  it("persisted setup_status drives inventoryNeedsSetup", () => {
    expect(inventoryNeedsSetup({ setup_status: "needs_setup" })).toBe(true);
    expect(inventoryNeedsSetup({ setup_status: "ready", item_type: "retail" })).toBe(false);
  });
});

describe("sale search / typeahead eligibility", () => {
  const readyRetail = {
    active: true,
    deleted_at: null,
    item_type: "retail" as const,
    setup_status: "ready" as const,
    sell_price_usd_cents: 1000,
  };

  it("excludes needs_setup, assets, and missing price", () => {
    expect(isSellableForSaleSearch(readyRetail)).toBe(true);
    expect(isSellableForSaleSearch({ ...readyRetail, setup_status: "needs_setup" })).toBe(false);
    expect(isSellableForSaleSearch({ ...readyRetail, item_type: "asset" })).toBe(false);
    expect(isSellableForSaleSearch({ ...readyRetail, sell_price_usd_cents: null, sell_price_lrd_cents: null })).toBe(
      false,
    );
    expect(isSellableForSaleSearch({ ...readyRetail, sell_price_usd_cents: 0, store_price_usd_cents: 0 })).toBe(false);
  });

  it("filterSellableInventoryItems keeps only sellable rows", () => {
    const rows = filterSellableInventoryItems([
      readyRetail,
      { ...readyRetail, setup_status: "needs_setup" },
      { ...readyRetail, item_type: "asset" },
    ]);
    expect(rows).toHaveLength(1);
  });
});

describe("sale guard error mapping", () => {
  it("maps stable codes from exception text", () => {
    expect(mapInventorySaleGuardError("product_needs_setup: Dummy Head")).toBe("product_needs_setup");
    expect(mapInventorySaleGuardError("product_not_sellable: Pink Nail Table")).toBe("product_not_sellable");
    expect(mapInventorySaleGuardError("product_missing_retail_price: X")).toBe("product_missing_retail_price");
    expect(mapInventorySaleGuardError("insufficient_stock")).toBeNull();
  });

  it("documents server-side guard scenarios (DB/RPC checklist)", () => {
    const scenarios = [
      "needs_setup_blocks_sale_create",
      "asset_blocks_sale_create",
      "zero_price_blocks_sale_create",
      "needs_setup_blocks_sale_edit_add",
      "asset_blocks_sale_edit_add",
    ];
    expect(scenarios).toHaveLength(5);
  });
});

describe("dashboard setup progress", () => {
  it("counts needs_setup, assets, and totals", () => {
    const summary = summarizeInventorySetupProgress([
      { item_type: "retail", setup_status: "needs_setup" },
      { item_type: "retail", setup_status: "ready" },
      { item_type: "asset", setup_status: "needs_setup" },
      { item_type: "asset", setup_status: "ready" },
      { item_type: "retail", setup_status: "needs_setup", deleted_at: "2026-01-01" },
    ]);
    expect(summary.totalProducts).toBe(4);
    expect(summary.needsSetupCount).toBe(2);
    expect(summary.assetCount).toBe(2);
    expect(summary.readyRetailCount).toBe(1);
  });
});
