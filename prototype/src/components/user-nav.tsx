import { signOut } from "@/auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SidebarLink } from "@/components/sidebar-link";
import { auditScope, can } from "@/platform/rbac";
import { listApps } from "@/platform/registry";
import { ROLE_LABELS } from "@/platform/roles";
import { getCurrentUser } from "@/platform/session";

/** Left sidebar: registered apps the user can view, plus admin links. */
export async function AppSidebar() {
  const user = await getCurrentUser();
  if (!user) return null;
  const apps = listApps().filter((a) => can(user, a.viewPermission));

  return (
    <nav className="flex flex-col gap-1">
      <SidebarLink href="/">Home</SidebarLink>
      <p className="mt-4 px-3 pb-1 text-xs font-medium uppercase tracking-wide text-sidebar-foreground/60">
        Apps
      </p>
      {apps.map((app) =>
        app.status === "live" ? (
          <SidebarLink key={app.id} href={app.href}>
            {app.name}
          </SidebarLink>
        ) : (
          <span
            key={app.id}
            className="flex items-center justify-between px-3 py-2 text-sm text-sidebar-foreground/50"
            title="Not built yet"
          >
            {app.name}
            <span className="text-[10px] uppercase">soon</span>
          </span>
        ),
      )}
      {auditScope(user).length > 0 && (
        <>
          <p className="mt-4 px-3 pb-1 text-xs font-medium uppercase tracking-wide text-sidebar-foreground/60">
            Admin
          </p>
          <SidebarLink href="/admin/audit">Audit log</SidebarLink>
        </>
      )}
    </nav>
  );
}

/** Top-right: signed-in user, role and sign-out. */
export async function UserMenu() {
  const user = await getCurrentUser();
  if (!user) return null;
  return (
    <div className="flex items-center gap-3 text-sm">
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
  );
}
