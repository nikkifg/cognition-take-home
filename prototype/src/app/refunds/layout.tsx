import { Suspense } from "react";
import { db } from "@/lib/db";
import { can } from "@/platform/rbac";
import { getCurrentUser } from "@/platform/session";
import { RefundsNav } from "./refunds-nav";

async function Nav() {
  const user = await getCurrentUser();
  if (!can(user, "refunds.view")) return null;
  const links = [{ href: "/refunds", label: "Transactions" }];
  if (can(user, "refunds.approve")) {
    const pending = await db.approvalRequest.count({ where: { app: "refunds", status: "PENDING" } });
    links.push({ href: "/refunds/approvals", label: `Pending approvals (${pending})` });
  }
  return <RefundsNav links={links} />;
}

export default function RefundsLayout({ children }: LayoutProps<"/refunds">) {
  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold">Refunds dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Full refunds only. Every refund needs approval from a second finance admin.
        </p>
      </div>
      <Suspense fallback={null}>
        <Nav />
      </Suspense>
      {children}
    </>
  );
}
