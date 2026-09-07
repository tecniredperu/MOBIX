import type { Metadata } from "next";
import "./globals.css";
import "./mobix-v03.css";

export const metadata: Metadata = {
  title: "MOBIX",
  description: "Gestión inteligente para tu tienda móvil",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
