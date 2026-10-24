"use client";

import { Printer } from "lucide-react";
import { buttonVariants } from "@/components/ui";

/** Opens the browser's print dialog ("Save as PDF" turns the page into a file). */
export function PrintButton({ label }: { label: string }) {
  return (
    <button type="button" onClick={() => window.print()} className={buttonVariants({ variant: "secondary", size: "sm" })}>
      <Printer className="h-4 w-4" aria-hidden />
      {label}
    </button>
  );
}
