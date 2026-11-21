import type { Metadata, Viewport } from "next";
import { League_Spartan, DM_Sans, Poppins, IBM_Plex_Mono, Caveat } from "next/font/google";
import "./globals.css";

const spartan = League_Spartan({ variable: "--font-spartan", subsets: ["latin"], weight: ["500", "600", "700", "800"], display: "swap" });
const dmSans = DM_Sans({ variable: "--font-dmsans", subsets: ["latin"], weight: ["400", "500", "600", "700"], display: "swap" });
const poppins = Poppins({ variable: "--font-poppins", subsets: ["latin"], weight: ["400", "600", "700"], display: "swap" });
const caveat = Caveat({ variable: "--font-caveat", subsets: ["latin"], weight: ["500", "700"], display: "swap" });
const plexMono = IBM_Plex_Mono({ variable: "--font-plex-mono", subsets: ["latin"], weight: ["400", "500", "600"], display: "swap" });

export const metadata: Metadata = {
  title: { default: "SIGO · Tu historia te sigue", template: "%s · SIGO" },
  description: "Rescata el historial médico atrapado en papel y sistemas antiguos, y lo une en un expediente digital ligado al DPI.",
  icons: { icon: "/icono.svg" },
};

export const viewport: Viewport = {
  themeColor: "#EEEAE5",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es-GT" className={`${spartan.variable} ${dmSans.variable} ${poppins.variable} ${plexMono.variable} ${caveat.variable}`}>
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
