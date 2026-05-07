"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Heart, LayoutDashboard, ClipboardCheck, BarChart3, Settings as SettingsIcon, Sparkles } from "lucide-react";
import { cn } from "../lib/cn";

const links = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/review", label: "Review queue", icon: ClipboardCheck },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/settings", label: "Settings", icon: SettingsIcon },
];

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="w-[240px] shrink-0 px-7 py-9 border-r" style={{ borderColor: "var(--color-border)" }}>
      <Link href="/" className="flex items-center gap-2 mb-10">
        <span
          className="grid place-items-center w-9 h-9 rounded-full"
          style={{ background: "var(--color-accent)" }}
        >
          <Heart size={18} fill="white" stroke="white" />
        </span>
        <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 22 }}>pookie</span>
      </Link>
      <nav className="flex flex-col gap-1">
        {links.map((l) => {
          const active = pathname === l.href || (l.href !== "/" && pathname.startsWith(l.href));
          const Icon = l.icon;
          return (
            <Link
              key={l.href}
              href={l.href}
              className={cn("nav-link flex items-center gap-2.5", active && "active")}
            >
              <Icon size={16} />
              <span>{l.label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="mt-12 px-3 py-3 rounded-xl text-[12px] leading-relaxed" style={{ background: "var(--color-surface-2)", color: "var(--color-ink-soft)" }}>
        <Sparkles size={14} className="inline mr-1.5" />
        Pookie applies for you in the background. Take a break.
      </div>
    </aside>
  );
}
