"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import React from "react";
import { Building2, Home, LogOut, Shield, Users } from "lucide-react";

const navItems = [
  { href: "/admin", label: "工作台", icon: Home },
  { href: "/admin/workspaces", label: "工厂管理", icon: Building2 },
  { href: "/admin/accounts", label: "客户账号", icon: Users },
  { href: "/admin/admins", label: "运维账号", icon: Shield },
];

function isActivePath(pathname: string, href: string) {
  return pathname === href || (href !== "/admin" && pathname.startsWith(`${href}/`));
}

export function AdminShell({
  adminDisplayName,
  children,
}: {
  adminDisplayName: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-slate-50 text-slate-950">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-slate-200 bg-white md:flex md:flex-col">
        <div className="border-b border-slate-200 px-5 py-4">
          <p className="text-base font-semibold">平台运维后台</p>
          <p className="mt-1 truncate text-sm text-slate-500">
            {adminDisplayName}
          </p>
        </div>
        <nav className="flex-1 space-y-1 px-3 py-4" aria-label="后台导航">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActivePath(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={[
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-slate-900 text-white"
                    : "text-slate-700 hover:bg-slate-100 hover:text-slate-950",
                ].join(" ")}
                aria-current={active ? "page" : undefined}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
        <form
          action="/api/admin/auth/logout"
          method="post"
          className="border-t border-slate-200 p-3"
        >
          <button
            type="submit"
            className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 hover:text-slate-950"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            <span>退出后台</span>
          </button>
        </form>
      </aside>

      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white px-4 py-3 md:hidden">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">平台运维后台</p>
            <p className="text-xs text-slate-500">{adminDisplayName}</p>
          </div>
          <form action="/api/admin/auth/logout" method="post">
            <button
              type="submit"
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 text-slate-700"
              aria-label="退出后台"
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
            </button>
          </form>
        </div>
      </header>

      <main className="min-h-screen px-4 py-5 pb-24 md:ml-64 md:px-6 md:py-6 md:pb-6">
        {children}
      </main>

      <nav
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-slate-200 bg-white md:hidden"
        aria-label="移动后台导航"
      >
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = isActivePath(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={[
                "flex min-h-14 flex-col items-center justify-center gap-1 text-xs font-medium",
                active ? "text-slate-950" : "text-slate-500",
              ].join(" ")}
              aria-current={active ? "page" : undefined}
            >
              <Icon className="h-5 w-5" aria-hidden="true" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
