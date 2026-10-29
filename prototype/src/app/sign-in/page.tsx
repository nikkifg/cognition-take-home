import { Suspense } from "react";
import { connection } from "next/server";
import { signIn } from "@/auth";
import { db } from "@/lib/db";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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

const ERROR_MESSAGES: Record<string, string> = {
  CredentialsSignin: "That account isn't in the mock Entra tenant. Pick one of the personas below.",
};

async function SignInError({ searchParams }: { searchParams: PageProps<"/sign-in">["searchParams"] }) {
  const { error } = await searchParams;
  if (!error) return null;
  const code = Array.isArray(error) ? error[0] : error;
  return (
    <Alert variant="destructive" className="mb-4">
      <AlertTitle>Sign-in failed</AlertTitle>
      <AlertDescription>{Object.hasOwn(ERROR_MESSAGES, code)
          ? ERROR_MESSAGES[code]
          : `Something went wrong (${code}). Try again.`}</AlertDescription>
    </Alert>
  );
}

export default function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  return (
    <Card className="mx-auto w-full max-w-2xl">
      <CardHeader>
        <CardTitle>Sign in with Microsoft Entra ID (mock)</CardTitle>
        <CardDescription>
          Pick an account. Each synthetic persona carries one Entra app role.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Suspense fallback={null}>
          <SignInError searchParams={searchParams} />
        </Suspense>
        <Suspense fallback={<p className="text-sm text-muted-foreground">Loading accounts…</p>}>
          <PersonaList />
        </Suspense>
      </CardContent>
    </Card>
  );
}
