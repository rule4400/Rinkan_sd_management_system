"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function GatePage() {
  return (
    <Suspense fallback={null}>
      <GateInner />
    </Suspense>
  );
}

function GateInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [passphrase, setPassphrase] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/gate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passphrase }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "認証に失敗しました");
      }
      const next = params.get("next") || "/";
      router.replace(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "認証に失敗しました");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-2xl bg-white p-6 shadow"
      >
        <h1 className="text-xl font-bold">アクセス確認</h1>
        <p className="mt-1 text-sm text-slate-500">
          チーム共通パスを入力してください。
        </p>

        {error && (
          <div className="mt-4 rounded-lg bg-red-100 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <input
          type="password"
          className="field mt-4"
          placeholder="チーム共通パス"
          value={passphrase}
          onChange={(e) => setPassphrase(e.target.value)}
          autoFocus
        />

        <button
          type="submit"
          disabled={loading}
          className="tap-btn-primary mt-5 w-full disabled:opacity-60"
        >
          {loading ? "確認中…" : "入室する"}
        </button>
      </form>
    </div>
  );
}
