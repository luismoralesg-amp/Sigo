"use client";
import * as React from "react";
import * as D from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export const Dialogo = D.Root;
export const DialogoDisparador = D.Trigger;
export const DialogoTitulo = D.Title;
export const DialogoDescripcion = D.Description;

export function DialogoContenido({ className, children, ...props }: React.ComponentProps<typeof D.Content>) {
  return (
    <D.Portal>
      <D.Overlay className="fixed inset-0 z-50 bg-[#1a2744]/55 data-[state=open]:animate-[aparecer_150ms_ease-out]" />
      <D.Content
        className={cn(
          "fixed left-1/2 top-1/2 z-50 max-h-[92dvh] w-[calc(100vw-24px)] max-w-3xl -translate-x-1/2 -translate-y-1/2 overflow-auto rounded-[12px] bg-superficie p-4 focus:outline-none data-[state=open]:animate-[aparecer_150ms_ease-out] sm:p-6",
          className
        )}
        {...props}
      >
        {children}
        <D.Close className="absolute right-2 top-2 grid h-12 w-12 place-items-center rounded-full bg-superficie text-tinta-suave hover:bg-papel hover:text-tinta" aria-label="Cerrar">
          <X className="h-5 w-5" />
        </D.Close>
      </D.Content>
      <style>{`@keyframes aparecer{from{opacity:0}to{opacity:1}}`}</style>
    </D.Portal>
  );
}
