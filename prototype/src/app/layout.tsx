import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import { AppSidebar, UserMenu } from "@/components/user-nav";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Internal Tools",
  description: "Internal tools prototype",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full">
        <aside className="flex w-60 shrink-0 flex-col gap-6 bg-sidebar px-3 py-4 text-sidebar-foreground">
          <Link href="/" className="flex items-center gap-2 px-3 font-semibold">
            <span className="size-2.5 rounded-full bg-sidebar-primary" />
            Internal Tools
          </Link>
          <Suspense fallback={null}>
            <AppSidebar />
          </Suspense>
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-14 items-center justify-end border-b bg-card px-6">
            <Suspense fallback={null}>
              <UserMenu />
            </Suspense>
          </header>
          <main className="flex w-full max-w-6xl flex-1 flex-col gap-6 px-8 py-8">{children}</main>
        </div>
      </body>
    </html>
  );
}
