import { Suspense } from "react";
import { connection } from "next/server";
import { signIn } from "@/auth";
import { db } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ROLE_LABELS } from "@/platform/roles";

async function PersonaList() {
  await connection();
  const users = await db.user.findMany({ orderBy: { oid: "asc" } });
  if (users.length === 0) {
    return <p className="text-sm text-muted-foreground">No users. Run `npm run db:seed`.</p>;
  }
  return (
    <ul className="divide-y">
      {users.map((u) => (
        <li key={u.id} className="flex items-center gap-4 py-3">
          <div className="flex-1">
            <div className="font-medium">{u.displayName}</div>
            <div className="text-sm text-muted-foreground">{u.email}</div>
          </div>
          <Badge variant="secondary">{ROLE_LABELS[u.role]}</Badge>
          <form
            action={async () => {
              "use server";
              await signIn("entra-mock", { userId: u.id, redirectTo: "/" });
            }}
          >
            <Button type="submit" size="sm">
              Sign in
            </Button>
          </form>
        </li>
      ))}
    </ul>
  );
}

export default function SignInPage() {
  return (
    <Card className="mx-auto w-full max-w-2xl">
      <CardHeader>
        <CardTitle>Sign in with Microsoft Entra ID (mock)</CardTitle>
        <CardDescription>
          Pick an account. Each synthetic persona carries one Entra app role.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Suspense fallback={<p className="text-sm text-muted-foreground">Loading accounts…</p>}>
          <PersonaList />
        </Suspense>
      </CardContent>
    </Card>
  );
}
