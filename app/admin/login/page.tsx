"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function AdminLoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "ログインに失敗しました");
      }
      router.replace("/admin");
    } catch (err) {
      setError(err instanceof Error ? err.message : "ログインに失敗しました");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm rounded-2xl bg-white p-6 shadow"
      >
        <h1 className="text-xl font-bold">管理者ログイン</h1>
        <p className="mt-1 text-sm text-slate-500">
          SDカード管理システム
        </p>

        {error && (
          <div className="mt-4 rounded-lg bg-red-100 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <label className="mt-4 block text-sm font-medium">ユーザー名</label>
        <input
          className="field mt-1"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
        />

        <label className="mt-3 block text-sm font-medium">パスワード</label>
        <input
          className="field mt-1"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
        />

        <button
          type="submit"
          disabled={loading}
          className="tap-btn-primary mt-6 w-full disabled:opacity-60"
        >
          {loading ? "ログイン中…" : "ログイン"}
        </button>

        <p className="mt-4 text-center text-xs text-slate-400">
          初期アカウントは seed で作成（既定: admin / admin1234）。本番では必ず変更してください。
        </p>

        <div className="mt-5 border-t border-slate-100 pt-4 text-center">
          <Link
            href="/"
            className="inline-block rounded-lg bg-slate-100 px-5 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-200"
          >
            ← 利用者画面（登録）へ
          </Link>
        </div>
      </form>
    </div>
  );
}
