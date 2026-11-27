"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BookMarked, BookOpen, Layers, LogOut } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { getReviewStats } from "@/lib/api";

interface NavbarProps {
  rightSlot?: React.ReactNode;
}

export function Navbar({ rightSlot }: NavbarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const [dueCount, setDueCount] = useState<number>(0);

  useEffect(() => {
    if (!user) return;
    let active = true;
    getReviewStats()
      .then((stats) => {
        if (active) setDueCount(stats.due_now);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [user, pathname]);

  const handleLogout = () => {
    logout();
    router.push("/login");
  };

  const navItems = [
    { href: "/", label: "Library", icon: BookOpen },
    { href: "/vocab", label: "Vocabulary", icon: BookMarked },
    { href: "/review", label: "Review", icon: Layers, badge: dueCount },
  ];

  return (
    <header className="border-b border-stone-200 bg-white/85 backdrop-blur sticky top-0 z-30">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 sm:px-6 py-3">
        <div className="flex items-center gap-5">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-orange-600 text-white font-bold hanzi-font text-base shadow-sm">
              读
            </div>
            <span className="text-base font-bold tracking-tight text-stone-900">
              ch-emon
            </span>
          </Link>

          <nav className="flex items-center gap-1">
            {navItems.map(({ href, label, icon: Icon, badge }) => {
              const active =
                href === "/" ? pathname === "/" : pathname.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium transition ${
                    active
                      ? "bg-orange-50 text-orange-800"
                      : "text-stone-600 hover:bg-stone-100 hover:text-stone-900"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span>{label}</span>
                  {typeof badge === "number" && badge > 0 && (
                    <span className="ml-0.5 rounded-full bg-orange-600 px-1.5 py-0.2 text-[11px] font-semibold text-white">
                      {badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center gap-2">
          {rightSlot}
          {user && (
            <div className="flex items-center gap-2 pl-2 border-l border-stone-200">
              <span className="hidden sm:inline text-xs font-medium text-stone-500 max-w-[120px] truncate">
                {user.name}
              </span>
              <button
                type="button"
                onClick={handleLogout}
                title="Sign out"
                className="inline-flex items-center gap-1 rounded-lg p-1.5 text-stone-500 hover:bg-stone-100 hover:text-stone-800 transition"
                aria-label="Sign out"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
