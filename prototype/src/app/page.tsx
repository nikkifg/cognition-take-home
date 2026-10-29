import { Suspense } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { can, permissionCatalog } from "@/platform/rbac";
import { listApps } from "@/platform/registry";
import { ROLE_LABELS } from "@/platform/roles";
import { requireUser } from "@/platform/session";

async function Home() {
  const user = await requireUser();
  const apps = listApps();
  const granted = Object.entries(permissionCatalog()).filter(([name]) => can(user, name));

  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold">Apps</h1>
        <p className="text-sm text-muted-foreground">
          Signed in as {user.displayName} ({ROLE_LABELS[user.role]}).
        </p>
      </div>
      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>App</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Your access</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {apps.map((app) => (
              <TableRow key={app.id}>
                <TableCell className="font-medium">{app.name}</TableCell>
                <TableCell>{app.description}</TableCell>
                <TableCell>
                  <Badge variant={app.status === "live" ? "default" : "secondary"}>{app.status}</Badge>
                </TableCell>
                <TableCell>{can(user, app.viewPermission) ? "Yes" : "No"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <h2 className="text-lg font-semibold">Your permissions</h2>
      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Permission</TableHead>
              <TableHead>Description</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {granted.map(([name, p]) => (
              <TableRow key={name}>
                <TableCell className="font-mono text-xs">{name}</TableCell>
                <TableCell>{p.description}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
      <Home />
    </Suspense>
  );
}
