import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import { UserNav } from "@/components/user-nav";
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
      <body className="min-h-full flex flex-col">
        <header className="border-b">
          <div className="mx-auto flex w-full max-w-6xl items-center gap-6 px-6 py-3">
            <Link href="/" className="font-semibold">
              Internal Tools
            </Link>
            <Suspense fallback={null}>
              <UserNav />
            </Suspense>
          </div>
        </header>
        <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-6 py-8">
          {children}
        </main>
      </body>
    </html>
  );
}
