"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "cn";

export function RefundsNav({ links }: { links: { href: string; label: string }[] }) {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1 border-b">
      {links.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          className={cn(
            "-mb-px border-b-2 px-3 py-2 text-sm",
            pathname === l.href
              ? "border-primary font-medium text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
