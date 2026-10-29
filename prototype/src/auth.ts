// Mock Microsoft Entra ID sign-in. In production this becomes the
// `next-auth/providers/microsoft-entra-id` provider; the rest of the app only
// sees the user id and reads role from the User table.
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { db } from "@/lib/db";
import { writeAudit } from "@/platform/audit";
import { MOCK_TENANT_ID } from "@/platform/personas";

async function auditAuth(userId: string | undefined, action: string) {
  if (!userId) return;
  const user = await db.user.findUnique({ where: { id: userId } });
  if (user) await writeAudit(db, { actor: user, action, app: "platform" });
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      id: "entra-mock",
      name: "Microsoft Entra ID (mock)",
      credentials: { userId: {} },
      authorize: async (credentials) => {
        const user = await db.user.findUnique({ where: { id: String(credentials?.userId ?? "") } });
        if (!user || user.tenantId !== MOCK_TENANT_ID) return null;
        return { id: user.id, email: user.email, name: user.displayName };
      },
    }),
  ],
  session: { strategy: "jwt", maxAge: 8 * 60 * 60 },
  pages: { signIn: "/sign-in" },
  callbacks: {
    async jwt({ token, user }) {
      if (user?.id) {
        const u = await db.user.findUnique({ where: { id: user.id } });
        // Entra-style claims, for display only; authorization reads the DB.
        token.oid = u?.oid;
        token.tid = u?.tenantId;
        token.roles = u ? [u.role] : [];
      }
      return token;
    },
    session({ session, token }) {
      if (token.sub) session.user.id = token.sub;
      return session;
    },
  },
  events: {
    signIn: ({ user }) => auditAuth(user.id, "auth.sign_in"),
    signOut: (message) => auditAuth("token" in message ? message.token?.sub : undefined, "auth.sign_out"),
  },
});
