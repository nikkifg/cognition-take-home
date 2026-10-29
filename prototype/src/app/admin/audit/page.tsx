import { Suspense } from "react";
import { db } from "@/lib/db";
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

async function AuditLog() {
  const user = await requireUser();
  if (!can(user, "audit.view")) {
    return <p className="text-sm">403: you need the audit.view permission to see the audit log.</p>;
  }
  const events = await db.auditEvent.findMany({ orderBy: { id: "desc" }, take: LIMIT });

  return (
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
            <TableCell className="font-mono text-xs">{e.action}</TableCell>
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
  );
}

export default function AuditPage() {
  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold">Audit log</h1>
        <p className="text-sm text-muted-foreground">
          Append-only. Changes (before/after), sensitive-field reveals, denied actions and sign-ins.
          Latest {LIMIT} events.
        </p>
      </div>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
        <AuditLog />
      </Suspense>
    </>
  );
}
