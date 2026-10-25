import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils/cn";

/** Page `page` (1-based) of `count` items, `size` per page. */
export function pageSlice<T>(items: T[], page: number, size: number): { items: T[]; page: number; pages: number } {
  const pages = Math.max(1, Math.ceil(items.length / size));
  const p = Math.min(Math.max(1, Math.floor(page) || 1), pages);
  return { items: items.slice((p - 1) * size, p * size), page: p, pages };
}

/** Prev / numbered / next links; `href(n)` builds each page's URL. Renders nothing for one page. */
export function Pager({ page, pages, href }: { page: number; pages: number; href: (page: number) => string }) {
  if (pages <= 1) return null;
  // First, last, and two around the current page.
  const shown = [...new Set([1, page - 2, page - 1, page, page + 1, page + 2, pages])].filter((n) => n >= 1 && n <= pages).sort((a, b) => a - b);
  const item = "flex min-h-9 min-w-9 items-center justify-center rounded-lg border px-2 text-sm transition-colors";
  return (
    <nav aria-label="Strony" className="flex flex-wrap items-center justify-center gap-1.5">
      {page > 1 && (
        <Link href={href(page - 1)} className={cn(item, "border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--border-hover)]")} aria-label="Poprzednia strona">
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </Link>
      )}
      {shown.map((n, i) => (
        <span key={n} className="flex items-center gap-1.5">
          {i > 0 && n - shown[i - 1] > 1 && <span className="text-[var(--text-disabled)]">…</span>}
          <Link
            href={href(n)}
            aria-current={n === page ? "page" : undefined}
            className={cn(
              item,
              n === page
                ? "border-[var(--border-active)] bg-[var(--accent-muted)] text-[var(--text-primary)]"
                : "border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--border-hover)]"
            )}
          >
            {n}
          </Link>
        </span>
      ))}
      {page < pages && (
        <Link href={href(page + 1)} className={cn(item, "border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--border-hover)]")} aria-label="Następna strona">
          <ChevronRight className="h-4 w-4" aria-hidden />
        </Link>
      )}
    </nav>
  );
}
