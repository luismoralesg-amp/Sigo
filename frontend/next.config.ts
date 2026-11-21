import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Permite abrir el servidor de desarrollo desde el celular en la misma red (demo).
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*", "172.*.*.*"],
  // Carpeta de salida configurable para compilar sin pisar el servidor de desarrollo.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // Los mocks del contrato viven en ../contrato/mocks (fuera de frontend/) y el servidor simulado los importa.
  experimental: { externalDir: true },
  // Raíz del repo (frontend/ + contrato/), para que Next no la adivine por otros lockfiles.
  outputFileTracingRoot: path.resolve(process.cwd(), ".."),
};

export default nextConfig;
