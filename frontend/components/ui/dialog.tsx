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
      <D.Overlay className="fixed inset-0 z-50 bg-[#1c2333]/55 backdrop-blur-[2px] data-[state=open]:animate-[aparecer_180ms_ease-out]" />
      <D.Content
        className={cn(
          "fixed left-1/2 top-1/2 z-50 max-h-[92dvh] w-[calc(100vw-24px)] max-w-3xl -translate-x-1/2 -translate-y-1/2 overflow-auto rounded-[18px] bg-superficie p-4 shadow-calida-lg focus:outline-none data-[state=open]:animate-[subir_220ms_cubic-bezier(.2,.8,.2,1)] sm:p-6",
          className
        )}
        {...props}
      >
        {children}
        <D.Close className="absolute right-3 top-3 grid h-11 w-11 place-items-center rounded-full bg-superficie/90 text-tinta-suave shadow-calida hover:text-tinta" aria-label="Cerrar">
          <X className="h-5 w-5" />
        </D.Close>
      </D.Content>
      <style>{`@keyframes aparecer{from{opacity:0}to{opacity:1}}@keyframes subir{from{opacity:0;transform:translateY(10px) scale(.98)}to{opacity:1;transform:none}}`}</style>
    </D.Portal>
  );
}
