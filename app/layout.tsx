import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Carrito · Gestión del equipo",
  description: "CRM, vehículos, gastos y accesos del equipo de Carrito.",
  icons: {
    icon: "/carrito-icon.png",
    shortcut: "/carrito-icon.png",
    apple: "/carrito-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className="antialiased">{children}</body>
    </html>
  );
}
