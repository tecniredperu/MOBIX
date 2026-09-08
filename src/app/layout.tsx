import type { Metadata } from "next";
import "./mobix.css";

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
