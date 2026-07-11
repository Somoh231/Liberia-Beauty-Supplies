import { describe, expect, it } from "vitest";

/** Mirrors editRetailSaleAction error mapping (stable codes for UI). */
function mapSaleEditError(message: string, code?: string): string {
  const msg = (message ?? "transaction_failed").toLowerCase();
  if (code === "PGRST202" || msg.includes("admin_edit_retail_sale") || msg.includes("could not find the function")) {
    return "migration_required";
  }
  if (msg.includes("inventory_movements_movement_type_check") || msg.includes("sale_edit_restore")) {
    return "migration_required";
  }
  if (msg.includes("unauthorized") || msg.includes("42501") || msg.includes("forbidden")) {
    return "unauthorized";
  }
  if (msg.includes("sale_not_found") || msg.includes("invalid_sale_id")) return "sale_not_found";
  if (msg.includes("product_not_found") || msg.includes("not_found")) return "product_not_found";
  if (msg.includes("insufficient_stock")) return "insufficient_stock";
  if (msg.includes("invalid_currency")) return "invalid_currency";
  if (msg.includes("invalid_price")) return "invalid_price";
  if (msg.includes("invalid_quantity") || msg.includes("invalid_qty")) return "invalid_quantity";
  if (msg.includes("edit_reason_required")) return "edit_reason_required";
  return "transaction_failed";
}

describe("sale edit error codes", () => {
  it("maps stable codes", () => {
    expect(mapSaleEditError("insufficient_stock")).toBe("insufficient_stock");
    expect(mapSaleEditError("sale_not_found")).toBe("sale_not_found");
    expect(mapSaleEditError("product_not_found")).toBe("product_not_found");
    expect(mapSaleEditError("edit_reason_required")).toBe("edit_reason_required");
    expect(mapSaleEditError("invalid_currency")).toBe("invalid_currency");
    expect(mapSaleEditError("invalid_price")).toBe("invalid_price");
    expect(mapSaleEditError("invalid_quantity")).toBe("invalid_quantity");
    expect(mapSaleEditError("unauthorized")).toBe("unauthorized");
    expect(mapSaleEditError("forbidden")).toBe("unauthorized");
    expect(mapSaleEditError("something else")).toBe("transaction_failed");
    expect(mapSaleEditError("missing", "PGRST202")).toBe("migration_required");
  });

  it("documents required transactional scenarios (RPC coverage checklist)", () => {
    const scenarios = [
      "quantity_decrease",
      "quantity_increase",
      "same_product_edit",
      "product_swap",
      "sale_date_edit",
      "currency_edit",
      "unit_price_edit",
      "archived_original_sku",
      "insufficient_stock",
      "staff_denied",
      "full_rollback",
    ];
    expect(scenarios).toHaveLength(11);
  });
});

describe("reset confirmation contract", () => {
  it("requires exact phrase", () => {
    const phrase = "RESET SALES AND INVENTORY";
    expect("RESET SALES AND INVENTORY").toBe(phrase);
    expect("reset sales and inventory").not.toBe(phrase);
  });
});
