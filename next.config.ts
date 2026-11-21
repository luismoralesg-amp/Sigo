import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Permite abrir el servidor de desarrollo desde el celular en la misma red (demo).
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*", "172.*.*.*"],
  // Carpeta de salida configurable para compilar sin pisar el servidor de desarrollo.
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
