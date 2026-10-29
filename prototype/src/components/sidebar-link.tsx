"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "cn";

export function SidebarLink({ href, children }: { href: string; children: React.ReactNode }) {
  const active = usePathname() === href;
  return (
    <Link
      href={href}
      className={cn(
        "rounded-md px-3 py-2 text-sm hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        active && "bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary",
      )}
    >
      {children}
    </Link>
  );
}
