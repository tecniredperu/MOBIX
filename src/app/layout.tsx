import type { Metadata } from "next";
import { AppShell } from "@/components/layout/app-shell";
import { getAuthContext } from "@/lib/auth-context";
import "./mobix.css";

export const metadata: Metadata = {
  title: "MOBIX",
  description: "Gestión inteligente para tu tienda móvil",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const auth = await getAuthContext({ redirectToLogin: false });

  return (
    <html lang="es" suppressHydrationWarning>
      <body suppressHydrationWarning>
        {auth ? <AppShell>{children}</AppShell> : children}
      </body>
    </html>
  );
}
