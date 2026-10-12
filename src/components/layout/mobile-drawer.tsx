"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import { Logo } from "./logo";
import { NavGroups } from "./nav-groups";
import { NavLink } from "./nav-link";
import { settingsItem, isActivePath } from "./nav-items";

interface MobileDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Full navigation for screens below 1024px (opened from the top bar or the "Więcej" tab). */
export function MobileDrawer({ open, onOpenChange }: MobileDrawerProps) {
  const pathname = usePathname();
  const close = () => onOpenChange(false);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] bg-[var(--overlay)] animate-fade-in lg:hidden" />
        <Dialog.Content
          className="fixed inset-y-0 left-0 z-[61] flex w-[min(300px,85vw)] flex-col border-r border-[var(--border)] bg-[var(--surface-1)] shadow-[var(--shadow-xl)] animate-slide-in focus:outline-none lg:hidden"
        >
          <div className="flex h-[var(--topbar-height)] shrink-0 items-center justify-between border-b border-[var(--border)] pl-5 pr-2">
            <Logo onClick={close} />
            <Dialog.Close
              aria-label="Zamknij menu"
              className="flex h-11 w-11 items-center justify-center rounded-md text-[var(--text-tertiary)] transition-colors hover:bg-[rgba(190,160,255,0.06)] hover:text-[var(--text-primary)]"
            >
              <X className="h-5 w-5" />
            </Dialog.Close>
          </div>
          <Dialog.Title className="sr-only">Menu</Dialog.Title>
          <Dialog.Description className="sr-only">Nawigacja po aplikacji</Dialog.Description>
          <nav aria-label="Główna nawigacja" className="flex-1 overflow-y-auto p-3">
            <NavGroups onNavigate={close} />
          </nav>
          <div className="border-t border-[var(--border)] p-3 pb-[calc(12px+env(safe-area-inset-bottom))]">
            <NavLink item={settingsItem} active={isActivePath(pathname, settingsItem.href)} onNavigate={close} />
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
