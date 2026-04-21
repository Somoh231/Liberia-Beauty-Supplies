/** Minimal line icons — stroke uses currentColor (set to gold in parent). */
export function ServiceCategoryIcon({ kind }: { kind: string }) {
  const stroke = "currentColor";
  const common = { width: 28, height: 28, viewBox: "0 0 24 24", fill: "none" as const, "aria-hidden": true as const };

  switch (kind) {
    case "hair":
      return (
        <svg {...common}>
          <path
            d="M8 5c2 0 3.5 1.2 4 3M6 19c1.5-2 2-4.5 2-7 0-2.5 1-5 3-6.5M16 19c-1-1.5-1.5-3.5-1.5-5.5 0-3 1-5.5 3-7"
            stroke={stroke}
            strokeWidth="1.35"
            strokeLinecap="round"
          />
        </svg>
      );
    case "braid":
      return (
        <svg {...common}>
          <path
            d="M7 4v16M10 4v16M13 4v16M16 4v16"
            stroke={stroke}
            strokeWidth="1.25"
            strokeLinecap="round"
          />
        </svg>
      );
    case "nails":
      return (
        <svg {...common}>
          <path
            d="M8 18c0-4 1.5-8 4-10M12 18c0-3.5 1-7 3-9M16 18c0-2.5.5-5 2-7"
            stroke={stroke}
            strokeWidth="1.35"
            strokeLinecap="round"
          />
        </svg>
      );
    case "makeup":
      return (
        <svg {...common}>
          <ellipse cx="9" cy="11" rx="2.2" ry="1.4" stroke={stroke} strokeWidth="1.25" />
          <ellipse cx="15" cy="11" rx="2.2" ry="1.4" stroke={stroke} strokeWidth="1.25" />
          <path d="M9 15h6" stroke={stroke} strokeWidth="1.25" strokeLinecap="round" />
        </svg>
      );
    case "pedi":
      return (
        <svg {...common}>
          <path
            d="M8 20V8l2-2h4l2 2v12M8 12h8M8 16h8"
            stroke={stroke}
            strokeWidth="1.25"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "wig":
      return (
        <svg {...common}>
          <path
            d="M7 10c0-3 2.2-5 5-5s5 2 5 5v3H7v-3zM9 13v6M15 13v6"
            stroke={stroke}
            strokeWidth="1.25"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "supplies":
      return (
        <svg {...common}>
          <path
            d="M6 8h12v10a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V8zM9 8V6a3 3 0 0 1 6 0v2"
            stroke={stroke}
            strokeWidth="1.25"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="7" stroke={stroke} strokeWidth="1.25" />
        </svg>
      );
  }
}
