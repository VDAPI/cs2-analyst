"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * A `<details>` whose body is rendered only once it is first opened (S28).
 * The report has dozens of closed sections with hundreds of finding cards;
 * rendering them all up front made the page ~460 KB of HTML. Closed, it looks
 * and behaves exactly like a plain `<details>`; open, the body stays mounted.
 */
export function LazyDetails({
  summary,
  children,
  ...props
}: Omit<React.DetailsHTMLAttributes<HTMLDetailsElement>, "children" | "onToggle"> & {
  /** The `<summary>` element. */
  summary: ReactNode;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  const [opened, setOpened] = useState(Boolean(props.open));
  // Opened before hydration (a fast tap), the toggle event was missed.
  useEffect(() => {
    if (ref.current?.open) setOpened(true);
  }, []);
  return (
    <details
      {...props}
      ref={ref}
      onToggle={(e) => {
        if (e.currentTarget.open) setOpened(true);
      }}
    >
      {summary}
      {opened ? children : null}
    </details>
  );
}
