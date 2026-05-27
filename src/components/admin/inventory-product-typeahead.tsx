"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { InventoryItemRow } from "@/lib/admin/salon-queries";

function normalize(s: string): string {
  return s.trim().toLowerCase();
}

function labelForItem(item: InventoryItemRow): string {
  const name = item.product_name || item.name || "—";
  const code = item.product_code ? ` · ${item.product_code}` : "";
  const qty = Number.isFinite(item.quantity_on_hand) ? ` (${item.quantity_on_hand} ${item.unit})` : "";
  return `${name}${code}${qty}`;
}

export function InventoryProductTypeaheadSelect({
  items,
  value,
  onValueChange,
  placeholder = "—",
  inputClassName,
  listClassName,
  maxResults = 30,
  debounceMs = 120,
  allowEmpty = true,
}: {
  items: InventoryItemRow[];
  value: string;
  onValueChange: (id: string) => void;
  placeholder?: string;
  inputClassName?: string;
  listClassName?: string;
  maxResults?: number;
  debounceMs?: number;
  allowEmpty?: boolean;
}) {
  const uid = useId();
  const listId = `typeahead-list-${uid}`;

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQuery(query), debounceMs);
    return () => window.clearTimeout(t);
  }, [query, debounceMs]);

  const selected = useMemo(() => items.find((i) => i.id === value) ?? null, [items, value]);

  const options = useMemo(() => {
    const q = normalize(debouncedQuery);
    const base =
      q.length === 0
        ? items.slice(0, maxResults)
        : items
            .filter((i) => {
              const pn = normalize(i.product_name || "");
              const pc = normalize(i.product_code || "");
              return pn.includes(q) || pc.includes(q);
            })
            .slice(0, maxResults);

    if (!allowEmpty) return base;
    return [{ id: "" } as InventoryItemRow, ...base];
  }, [items, debouncedQuery, maxResults, allowEmpty]);

  const selectedLabel = selected ? labelForItem(selected) : "";

  const displayedValue = open ? query : selectedLabel;

  function selectOptionByIndex(idx: number) {
    const opt = options[idx];
    const id = (opt as InventoryItemRow).id;
    onValueChange(id || "");
    setOpen(false);
    setQuery("");
    setDebouncedQuery("");
    setActiveIndex(0);
  }

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-controls={listId}
        aria-expanded={open}
        aria-autocomplete="list"
        aria-activedescendant={`${listId}-opt-${activeIndex}`}
        className={inputClassName}
        value={displayedValue}
        placeholder={placeholder}
        onFocus={() => {
          setOpen(true);
          setQuery("");
          setDebouncedQuery("");
          setActiveIndex(0);
        }}
        onChange={(e) => {
          setOpen(true);
          setQuery(e.target.value);
          setActiveIndex(0);
        }}
        onKeyDown={(e) => {
          if (!open) {
            if (e.key === "ArrowDown") {
              setOpen(true);
              setActiveIndex(0);
              e.preventDefault();
            }
            return;
          }

          if (e.key === "Escape") {
            setOpen(false);
            setQuery("");
            setDebouncedQuery("");
            return;
          }

          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActiveIndex((i) => Math.min(options.length - 1, i + 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActiveIndex((i) => Math.max(0, i - 1));
          } else if (e.key === "Enter") {
            e.preventDefault();
            if (options.length > 0) selectOptionByIndex(activeIndex);
          }
        }}
      />

      {open ? (
        <div
          id={listId}
          role="listbox"
          className={[
            "absolute left-0 right-0 z-20 mt-1 max-h-60 overflow-auto rounded-xl border border-white/10 bg-black/70 backdrop-blur p-1",
            listClassName ?? "",
          ].join(" ")}
        >
          {options.length === 0 ? (
            <div className="px-3 py-2 text-xs text-white/50">No matches</div>
          ) : (
            options.map((opt, idx) => {
              const isEmpty = (opt as InventoryItemRow).id === "";
              const item = opt as InventoryItemRow;
              const label = isEmpty ? placeholder : labelForItem(item);
              return (
                <button
                  key={`${item.id || "empty"}-${idx}`}
                  id={`${listId}-opt-${idx}`}
                  type="button"
                  role="option"
                  aria-selected={idx === activeIndex}
                  className={[
                    "w-full cursor-pointer rounded-lg px-3 py-2 text-left text-xs",
                    idx === activeIndex ? "bg-[var(--admin-accent)]/25 text-white" : "text-white/75 hover:bg-white/5",
                    isEmpty ? "text-white/65" : "",
                  ].join(" ")}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => selectOptionByIndex(idx)}
                >
                  {label}
                </button>
              );
            })
          )}
        </div>
      ) : null}
    </div>
  );
}

