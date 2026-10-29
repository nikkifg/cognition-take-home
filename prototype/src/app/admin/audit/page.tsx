import { Suspense } from "react";
import { db } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { can } from "@/platform/rbac";
import { requireUser } from "@/platform/session";

const LIMIT = 200;

function actionVariant(action: string) {
  if (action === "action.denied") return "destructive" as const;
  if (action.startsWith("auth.")) return "secondary" as const;
  if (action === "field.reveal") return "default" as const;
  return "outline" as const;
}

async function AuditLog() {
  const user = await requireUser();
  if (!can(user, "audit.view")) {
    return <p className="text-sm text-destructive">403: you need the audit.view permission to see the audit log.</p>;
  }
  const events = await db.auditEvent.findMany({ orderBy: { id: "desc" }, take: LIMIT });

  return (
    <div className="rounded-lg border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Time (UTC)</TableHead>
            <TableHead>Actor</TableHead>
            <TableHead>App</TableHead>
            <TableHead>Action</TableHead>
            <TableHead>Entity</TableHead>
            <TableHead>Before</TableHead>
            <TableHead>After</TableHead>
            <TableHead>Reason</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {events.length === 0 && (
            <TableRow>
              <TableCell colSpan={8} className="text-muted-foreground">
                No events yet.
              </TableCell>
            </TableRow>
          )}
          {events.map((e) => (
            <TableRow key={e.id} className="align-top">
              <TableCell className="font-mono text-xs">
                {e.createdAt.toISOString().replace("T", " ").slice(0, 19)}
              </TableCell>
              <TableCell>
                <div>{e.actorEmail}</div>
                <div className="text-xs text-muted-foreground">{e.actorRole}</div>
              </TableCell>
              <TableCell>{e.app}</TableCell>
              <TableCell>
                <Badge variant={actionVariant(e.action)} className="font-mono">
                  {e.action}
                </Badge>
              </TableCell>
              <TableCell className="text-xs">
                {e.entityType ? `${e.entityType} ${e.entityId ?? ""}` : "—"}
              </TableCell>
              <TableCell className="max-w-48 font-mono text-xs whitespace-pre-wrap break-all">
                {e.before ?? "—"}
              </TableCell>
              <TableCell className="max-w-48 font-mono text-xs whitespace-pre-wrap break-all">
                {e.after ?? "—"}
              </TableCell>
              <TableCell className="text-xs whitespace-normal">{e.reason ?? "—"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export default function AuditPage() {
  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold">Audit log</h1>
      </div>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
        <AuditLog />
      </Suspense>
    </>
  );
}
