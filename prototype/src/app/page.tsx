import { Suspense } from "react";
import { connection } from "next/server";
import { db } from "@/lib/db";

async function DbStatus() {
  await connection();
  const count = await db.auditEvent.count();
  return (
    <p className="text-sm text-zinc-600">
      Database connected. Audit events: {count}
    </p>
  );
}

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 px-8 py-16">
      <h1 className="text-2xl font-semibold">Internal Tools</h1>
      <Suspense fallback={<p className="text-sm text-zinc-500">Checking database…</p>}>
        <DbStatus />
      </Suspense>
    </main>
  );
}
