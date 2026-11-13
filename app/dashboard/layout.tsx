import type { Metadata } from "next";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

import { gqlCall } from "@/features/storefront/lib/data";

export async function generateMetadata(): Promise<Metadata> {
  const r = await gqlCall<{ storeLogo: { name: string } }>("{ storeLogo { name } }");
  const name = (r.ok && r.data.storeLogo?.name) || "Openfront Comedy Club";
  return { title: `${name} staff`, description: `Staff dashboard for ${name}.` };
}

export default function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      {children}
      <Toaster />
    </ThemeProvider>
  );
}
