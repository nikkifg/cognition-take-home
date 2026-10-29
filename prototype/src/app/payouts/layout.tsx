import { Suspense } from "react";
import { db } from "@/lib/db";
import { can } from "@/platform/rbac";
import { getCurrentUser } from "@/platform/session";
import { PayoutsNav } from "./payouts-nav";

async function Nav() {
  const user = await getCurrentUser();
  if (!can(user, "payouts.view")) return null;
  const links = [{ href: "/payouts", label: "Payees" }];
  if (can(user, "payouts.bank_change.approve")) {
    const pending = await db.approvalRequest.count({ where: { app: "payouts", status: "PENDING" } });
    links.push({ href: "/payouts/approvals", label: `Pending approvals (${pending})` });
  }
  return <PayoutsNav links={links} />;
}

export default function PayoutsLayout({ children }: LayoutProps<"/payouts">) {
  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold">Payout bank accounts</h1>
        <p className="text-sm text-muted-foreground">
          Every bank account change needs approval from a second finance admin. Account numbers stay masked.
        </p>
      </div>
      <Suspense fallback={null}>
        <Nav />
      </Suspense>
      {children}
    </>
  );
}
