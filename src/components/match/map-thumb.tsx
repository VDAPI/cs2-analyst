import { cn } from "@/lib/utils/cn";
import { mapThumbUrl } from "@/lib/utils/maps";

const SIZE = { sm: "h-9 w-9", md: "h-11 w-11", lg: "h-14 w-14" } as const;

/** Small square map radar used as the visual anchor of a match row. */
export function MapThumb({
  map,
  size = "md",
  className,
}: {
  map: string;
  size?: keyof typeof SIZE;
  className?: string;
}) {
  return (
    <div
      aria-hidden
      className={cn(
        "shrink-0 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface-3)] bg-cover bg-center",
        SIZE[size],
        className
      )}
      style={{
        backgroundImage: `url(${mapThumbUrl(map)})`,
        filter: "grayscale(35%) brightness(0.75)",
      }}
    />
  );
}
