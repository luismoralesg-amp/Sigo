"use client";
/**
 * Cola de fotos sin señal (regla 10 del contrato, P-04).
 * Guarda en el celular (IndexedDB) las fotos, el dpi y el client_id, y reintenta POST /fichas/foto
 * cuando vuelve la señal. Un client_id repetido devuelve la ficha que ya existe, así que reintentar es seguro.
 * Si IndexedDB no está disponible, la cola vive en memoria mientras la página siga abierta.
 */
import { useEffect, useSyncExternalStore } from "react";
import { api } from "@/lib/api/cliente";
import { aErrorApi } from "@/lib/api/errores";

export interface Pendiente {
  client_id: string;
  dpi: string;
  capturada_en: string;
  imagenes: Blob[];
}

type Estado = { pendientes: Array<Omit<Pendiente, "imagenes"> & { paginas: number }>; enLinea: boolean; subiendo: number; subidas: number };

const BASE = "sigo";
const ALMACEN = "fotos-pendientes";
let estado: Estado = { pendientes: [], enLinea: true, subiendo: 0, subidas: 0 };
const oyentes = new Set<() => void>();
const enMemoria = new Map<string, Pendiente>();
let iniciado = false;

function emitir(cambios: Partial<Estado>) {
  estado = { ...estado, ...cambios };
  oyentes.forEach((o) => o());
}

function abrir(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      const r = indexedDB.open(BASE, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(ALMACEN, { keyPath: "client_id" });
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function operar<T>(modo: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
  const db = await abrir();
  if (!db) return null;
  return new Promise((resolve) => {
    const tx = db.transaction(ALMACEN, modo);
    const req = fn(tx.objectStore(ALMACEN));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  });
}

async function leerTodos(): Promise<Pendiente[]> {
  const desdeDB = await operar<Pendiente[]>("readonly", (s) => s.getAll() as IDBRequest<Pendiente[]>);
  return desdeDB ?? [...enMemoria.values()];
}

async function refrescar() {
  const lista = await leerTodos();
  emitir({ pendientes: lista.map(({ imagenes, ...p }) => ({ ...p, paginas: imagenes.length })) });
}

async function quitar(clientId: string) {
  enMemoria.delete(clientId);
  await operar("readwrite", (s) => s.delete(clientId));
}

let subiendo = false;
async function subirTodo() {
  if (subiendo) return;
  const lista = await leerTodos();
  if (!lista.length) return;
  subiendo = true;
  emitir({ subiendo: lista.length });
  let ok = 0;
  for (const p of lista) {
    try {
      await api.subirFoto(p);
      await quitar(p.client_id);
      ok += 1;
    } catch (e) {
      // Sin señal otra vez: se queda en la cola. Otro error (p. ej. 403): también se queda, para revisarlo a mano.
      if (aErrorApi(e).codigo === "sin_senal") break;
    }
  }
  subiendo = false;
  await refrescar();
  emitir({ subiendo: 0, subidas: ok });
  if (ok) setTimeout(() => emitir({ subidas: 0 }), 4000);
}

function iniciar() {
  if (iniciado || typeof window === "undefined") return;
  iniciado = true;
  emitir({ enLinea: navigator.onLine });
  void refrescar();
  window.addEventListener("offline", () => emitir({ enLinea: false }));
  window.addEventListener("online", () => {
    emitir({ enLinea: true });
    void subirTodo();
  });
  if (navigator.onLine) void subirTodo();
}

export async function guardarPendiente(p: Pendiente) {
  enMemoria.set(p.client_id, p);
  await operar("readwrite", (s) => s.put(p));
  await refrescar();
}

export function estaEnLinea() {
  return typeof navigator === "undefined" ? true : navigator.onLine;
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
