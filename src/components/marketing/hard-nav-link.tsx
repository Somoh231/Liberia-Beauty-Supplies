"use client";

import { cn } from "@/lib/utils";
import { forwardRef } from "react";
import type { ComponentPropsWithoutRef } from "react";

type Props = Omit<ComponentPropsWithoutRef<"a">, "href"> & { href: string };

/** Plain `<a href>` for cross-tree navigations. */
export const HardNavLink = forwardRef<HTMLAnchorElement, Props>(function HardNavLink(
  { href, className, children, ...rest },
  ref,
) {
  return (
    <a
      ref={ref}
      href={href}
      className={cn(
        "rounded-sm outline-none transition-colors duration-200 [transition-timing-function:var(--ease-out)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]",
        className,
      )}
      {...rest}
    >
      {children}
    </a>
  );
});

HardNavLink.displayName = "HardNavLink";

