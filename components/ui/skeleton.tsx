import { cn } from "@/lib/utils";

/** Esqueleto con brillo cálido, no gris frío. */
export function Esqueleto({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-[10px] bg-[linear-gradient(90deg,#efe8db_0%,#f7f2e8_50%,#efe8db_100%)] bg-[length:200%_100%]",
        className
      )}
    />
  );
}
