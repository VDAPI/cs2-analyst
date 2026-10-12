

/** Where the demo came from. FACEIT keeps its brand orange via the `--faceit` token. */
export function SourceBadge({ source }: { source: string | null | undefined }) {
  if (source === "FACEIT") {
    return (
      <span className="inline-flex items-center rounded-full bg-[var(--faceit-muted)] px-1.5 py-0.5 text-[10px] font-bold leading-none text-[var(--faceit)]">
        FACEIT
      </span>
    );
  }
  return null;
}


