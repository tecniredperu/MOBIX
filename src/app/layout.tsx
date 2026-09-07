import type { Metadata } from "next";
import "./globals.css";
import "./mobix-v03.css";
import "./mobix-sales.css";
import "./mobix-pos-vuelto.css";
import "./mobix-dashboard.css";
import "./mobix-pro.css";
import "./mobix-cash.css";
import "./mobix-pos-cash.css";
import "./mobix-dashboard-data.css";
import "./mobix-customers.css";
import "./mobix-print-modals.css";
import "./mobix-service.css";
import "./mobix-service-print.css";
import "./mobix-business.css";

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
