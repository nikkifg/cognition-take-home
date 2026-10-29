import { cache } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import type { Actor } from "./roles";

/** Current user, with role read fresh from the database. Call inside <Suspense>. */
export const getCurrentUser = cache(async (): Promise<Actor | null> => {
  // Auth.js uses crypto before reading cookies; mark the render dynamic first.
  await connection();
  const session = await auth();
  const id = session?.user?.id;
  if (!id) return null;
  const user = await db.user.findUnique({ where: { id } });
  return user && { id: user.id, email: user.email, displayName: user.displayName, role: user.role };
});

export async function requireUser(): Promise<Actor> {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  return user;
}
