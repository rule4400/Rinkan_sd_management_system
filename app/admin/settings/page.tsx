"use client";

import { useEffect, useState } from "react";

export default function SettingsPage() {
  const [username, setUsername] = useState<string>("");
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(
    null,
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/admin/me")
      .then((r) => r.json())
      .then((d) => setUsername(d.admin?.username ?? ""));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (next.length < 8) {
      setMsg({ type: "err", text: "新しいパスワードは8文字以上にしてください" });
      return;
    }
    if (next !== confirm) {
      setMsg({ type: "err", text: "新しいパスワード（確認）が一致しません" });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/password", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "変更に失敗しました");
      }
      setMsg({ type: "ok", text: "パスワードを変更しました" });
      setCurrent("");
      setNext("");
      setConfirm("");
    } catch (err) {
      setMsg({
        type: "err",
        text: err instanceof Error ? err.message : "変更に失敗しました",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold">管理者設定</h1>
      <p className="mt-1 text-sm text-slate-500">
        ログイン中: <span className="font-medium">{username}</span>
      </p>

      <form
        onSubmit={submit}
        className="mt-6 max-w-md rounded-2xl bg-white p-6 shadow-sm"
      >
        <h2 className="text-lg font-semibold">パスワード変更</h2>

        {msg && (
          <div
            className={`mt-3 rounded-lg px-3 py-2 text-sm ${
              msg.type === "ok"
                ? "bg-emerald-100 text-emerald-700"
                : "bg-red-100 text-red-700"
            }`}
          >
            {msg.text}
          </div>
        )}

        <label className="mt-4 block text-sm font-medium">現在のパスワード</label>
        <input
          type="password"
          className="field mt-1"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          autoComplete="current-password"
        />

        <label className="mt-3 block text-sm font-medium">新しいパスワード</label>
        <input
          type="password"
          className="field mt-1"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          autoComplete="new-password"
        />
        <p className="mt-1 text-xs text-slate-400">8文字以上</p>

        <label className="mt-3 block text-sm font-medium">
          新しいパスワード（確認）
        </label>
        <input
          type="password"
          className="field mt-1"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="new-password"
        />

        <button
          type="submit"
          disabled={saving}
          className="tap-btn-primary mt-6 w-full disabled:opacity-60"
        >
          {saving ? "変更中…" : "パスワードを変更"}
        </button>
      </form>
    </div>
  );
}
