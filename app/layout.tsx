import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

import { gqlCall } from "@/features/storefront/lib/data";

export async function generateMetadata(): Promise<Metadata> {
  const r = await gqlCall<{ storeLogo: { name: string } }>("{ storeLogo { name } }");
  const name = (r.ok && r.data.storeLogo?.name) || "Openfront Comedy Club";
  return { title: name, description: `Shows, tickets and open mics at ${name}.` };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link href="/favicon.svg" rel="icon" />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
