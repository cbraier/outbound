import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

export default function CollapsibleCard({
  title,
  subtitle,
  defaultOpen = false,
  storageKey,
  children,
}: {
  title: string;
  subtitle?: string;
  defaultOpen?: boolean;
  storageKey?: string;
  children: ReactNode;
}) {
  const key = storageKey ? `ob:sec2:${storageKey}` : null;
  const [open, setOpen] = useState<boolean>(() => {
    if (!key) return defaultOpen;
    try {
      const r = localStorage.getItem(key);
      if (r != null) return r === "1";
    } catch {
      /* ignore */
    }
    return defaultOpen;
  });
  const toggle = () => {
    setOpen((o) => {
      const n = !o;
      if (key) {
        try {
          localStorage.setItem(key, n ? "1" : "0");
        } catch {
          /* ignore */
        }
      }
      return n;
    });
  };

  return (
    <div className="card p-5">
      <button type="button" onClick={toggle} className="flex w-full items-center justify-between gap-4 text-left">
        <div className="min-w-0">
          <h2 className="text-lg font-extrabold text-brand-deep">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs text-brand-ink/60">{subtitle}</p>}
        </div>
        <ChevronDown className={`h-5 w-5 shrink-0 text-brand-ink/40 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <div className="mt-3 space-y-3">{children}</div>}
    </div>
  );
}
