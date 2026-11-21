"use client";
/**
 * Cola de fichas confirmadas sin señal.
 * En la versión de interfaz guarda solo los datos de la ficha (localStorage);
 * al conectar el backend las fotos irán en IndexedDB y se subirán con POST /api/confirmar.
 */
import { useEffect, useSyncExternalStore } from "react";

export interface Pendiente {
  id: string;
  nombre: string;
  fecha: string;
  creada: string;
}

type Estado = { pendientes: Pendiente[]; enLinea: boolean; subiendo: number; subidas: number };

const CLAVE = "sigo:pendientes";
let estado: Estado = { pendientes: [], enLinea: true, subiendo: 0, subidas: 0 };
const oyentes = new Set<() => void>();
let iniciado = false;

function emitir(cambios: Partial<Estado>) {
  estado = { ...estado, ...cambios };
  oyentes.forEach((o) => o());
}

function guardar(lista: Pendiente[]) {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(lista));
  } catch {
    /* sin almacenamiento: la cola vive solo en memoria */
  }
}

function subirTodo() {
  const n = estado.pendientes.length;
  if (!n || estado.subiendo) return;
  emitir({ subiendo: n });
  // Simulación de subida: en producción, una petición por ficha con su foto.
  setTimeout(() => {
    guardar([]);
    emitir({ pendientes: [], subiendo: 0, subidas: n });
    setTimeout(() => emitir({ subidas: 0 }), 3500);
  }, 2200);
}

function iniciar() {
  if (iniciado || typeof window === "undefined") return;
  iniciado = true;
  let lista: Pendiente[] = [];
  try {
    lista = JSON.parse(localStorage.getItem(CLAVE) ?? "[]");
  } catch {
    lista = [];
  }
  emitir({ pendientes: lista, enLinea: navigator.onLine });
  window.addEventListener("offline", () => emitir({ enLinea: false }));
  window.addEventListener("online", () => {
    emitir({ enLinea: true });
    subirTodo();
  });
  if (navigator.onLine && lista.length) subirTodo();
}

export function agregarPendiente(p: Omit<Pendiente, "id" | "creada">) {
  const lista = [...estado.pendientes, { ...p, id: crypto.randomUUID(), creada: new Date().toISOString() }];
  guardar(lista);
  emitir({ pendientes: lista });
}

export function estaEnLinea() {
  return estado.enLinea;
}

const SERVIDOR: Estado = { pendientes: [], enLinea: true, subiendo: 0, subidas: 0 };

export function useConexion(): Estado {
  useEffect(iniciar, []);
  return useSyncExternalStore(
    (o) => {
      oyentes.add(o);
      return () => oyentes.delete(o);
    },
    () => estado,
    () => SERVIDOR
  );
}
