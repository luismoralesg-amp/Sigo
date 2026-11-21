import type { Metadata, Viewport } from "next";
import { Poppins } from "next/font/google";
import "./globals.css";

/** Poppins 600 solo para títulos y el nombre "SIGO", como el logo. El cuerpo usa la fuente del sistema. */
const poppins = Poppins({ variable: "--font-poppins", subsets: ["latin"], weight: ["600"], display: "swap" });

export const metadata: Metadata = {
  title: { default: "SIGO · Tu historia te sigue", template: "%s · SIGO" },
  description: "Tu historial médico, de papel a digital, y tú decides quién lo ve.",
  icons: { icon: "/icono.svg" },
};

export const viewport: Viewport = {
  themeColor: "#EEEAE5",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es-GT" className={poppins.variable}>
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
