import Link from "next/link";
import { signOut } from "@/auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { can } from "@/platform/rbac";
import { listApps } from "@/platform/registry";
import { ROLE_LABELS } from "@/platform/roles";
import { getCurrentUser } from "@/platform/session";

export async function UserNav() {
  const user = await getCurrentUser();
  if (!user) {
    return (
      <Link href="/sign-in" className="ml-auto text-sm underline">
        Sign in
      </Link>
    );
  }
  const apps = listApps().filter((a) => can(user, a.viewPermission));

  return (
    <>
      <nav className="flex items-center gap-4 text-sm">
        {apps.map((app) =>
          app.status === "live" ? (
            <Link key={app.id} href={app.href}>
              {app.name}
            </Link>
          ) : (
            <span key={app.id} className="text-muted-foreground" title="Not built yet">
              {app.name}
            </span>
          ),
        )}
        {can(user, "audit.view") && <Link href="/admin/audit">Audit log</Link>}
      </nav>
      <div className="ml-auto flex items-center gap-3 text-sm">
        <span>{user.displayName}</span>
        <Badge variant="secondary">{ROLE_LABELS[user.role]}</Badge>
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/sign-in" });
          }}
        >
          <Button size="sm" variant="outline" type="submit">
            Sign out
          </Button>
        </form>
      </div>
    </>
  );
}
