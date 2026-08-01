"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";

const NAV = [
  { href: "/admin", label: "ダッシュボード" },
  { href: "/admin/records", label: "利用記録" },
  { href: "/admin/masters", label: "マスタ管理" },
  { href: "/admin/settings", label: "設定" },
  { href: "/admin/advanced", label: "高度な設定" },
];

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const isLogin = pathname === "/admin/login";
  const [checked, setChecked] = useState(false);
  const [username, setUsername] = useState<string | null>(null);

  useEffect(() => {
    if (isLogin) {
      setChecked(true);
      return;
    }
    fetch("/api/admin/me")
      .then((r) => r.json())
      .then((d) => {
        if (!d.admin) {
          router.replace("/admin/login");
        } else {
          setUsername(d.admin.username);
          setChecked(true);
        }
      })
      .catch(() => router.replace("/admin/login"));
  }, [isLogin, router]);

  if (isLogin) return <>{children}</>;

  if (!checked) {
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-400">
        認証確認中…
      </div>
    );
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/admin/login");
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <span className="font-bold">SDカード管理 / 管理画面</span>
          </div>
          <nav className="flex flex-wrap items-center gap-1">
            {NAV.map((n) => {
              const active =
                n.href === "/admin"
                  ? pathname === "/admin"
                  : pathname.startsWith(n.href);
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  className={`rounded-lg px-3 py-1.5 text-sm ${
                    active
                      ? "bg-brand text-white"
                      : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  {n.label}
                </Link>
              );
            })}
            <span className="ml-2 hidden text-xs text-slate-400 sm:inline">
              {username}
            </span>
            <button
              onClick={logout}
              className="rounded-lg px-3 py-1.5 text-sm text-slate-500 hover:bg-slate-100"
            >
              ログアウト
            </button>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
