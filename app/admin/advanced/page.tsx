"use client";

import { useCallback, useEffect, useState } from "react";

type Backup = {
  name: string;
  createdAt: string;
  size: number;
  label: string | null;
};

const PHRASE = {
  transactions: "利用記録を全て削除",
  all: "全データを初期化",
} as const;

function fmt(iso: string): string {
  return new Date(iso).toLocaleString("ja-JP");
}
function kb(n: number): string {
  return `${Math.max(1, Math.round(n / 1024))} KB`;
}

export default function AdvancedPage() {
  const [backups, setBackups] = useState<Backup[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(
    null,
  );

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/backups");
    const d = await res.json();
    setBackups(d.backups ?? []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function createBackup() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/backups", { method: "POST" });
      if (!res.ok) throw new Error((await res.json()).error || "失敗");
      setMsg({ type: "ok", text: "バックアップを作成しました。" });
      await load();
    } catch (e) {
      setMsg({ type: "err", text: e instanceof Error ? e.message : "失敗" });
    } finally {
      setBusy(false);
    }
  }

  async function restore(name: string) {
    if (
      !confirm(
        `「${fmt(
          backups.find((b) => b.name === name)?.createdAt ?? "",
        )}」時点へロールバックします。\n現在のデータは自動でバックアップされますが、よろしいですか？`,
      )
    )
      return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/backups/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "失敗");
      setMsg({
        type: "ok",
        text: "ロールバックが完了しました。各画面を再読み込みしてください。",
      });
      await load();
    } catch (e) {
      setMsg({ type: "err", text: e instanceof Error ? e.message : "失敗" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-bold">高度な設定</h1>
      <p className="mt-1 text-sm text-slate-500">
        バックアップ・ロールバック・データ初期化など、取り扱い注意の操作です。
      </p>

      {msg && (
        <div
          className={`mt-4 rounded-lg px-3 py-2 text-sm ${
            msg.type === "ok"
              ? "bg-emerald-100 text-emerald-700"
              : "bg-red-100 text-red-700"
          }`}
        >
          {msg.text}
        </div>
      )}

      {/* バックアップ */}
      <section className="mt-6 rounded-2xl bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">バックアップ</h2>
          <button
            onClick={createBackup}
            disabled={busy}
            className="tap-btn-primary px-4 py-2 text-sm disabled:opacity-60"
          >
            今すぐバックアップ
          </button>
        </div>
        <p className="mt-1 text-xs text-slate-500">
          破壊的な操作（復元・全削除）の前には自動でバックアップが作成されます。
        </p>

        <div className="mt-4 divide-y divide-slate-100">
          {backups.map((b) => (
            <div
              key={b.name}
              className="flex flex-wrap items-center justify-between gap-2 py-2"
            >
              <div>
                <div className="font-medium">{fmt(b.createdAt)}</div>
                <div className="text-xs text-slate-400">
                  {b.label ? `（${b.label}） ` : ""}
                  {kb(b.size)} ・ {b.name}
                </div>
              </div>
              <button
                onClick={() => restore(b.name)}
                disabled={busy}
                className="rounded-lg border border-amber-300 px-3 py-1.5 text-sm text-amber-700 hover:bg-amber-50 disabled:opacity-60"
              >
                この日時に復元
              </button>
            </div>
          ))}
          {backups.length === 0 && (
            <div className="py-4 text-sm text-slate-400">
              バックアップはまだありません。
            </div>
          )}
        </div>
      </section>

      {/* データ初期化（危険ゾーン） */}
      <DangerZone busy={busy} setBusy={setBusy} onDone={load} setMsg={setMsg} />
    </div>
  );
}

function DangerZone({
  busy,
  setBusy,
  onDone,
  setMsg,
}: {
  busy: boolean;
  setBusy: (v: boolean) => void;
  onDone: () => void;
  setMsg: (m: { type: "ok" | "err"; text: string } | null) => void;
}) {
  const [scope, setScope] = useState<"transactions" | "all">("transactions");
  const [confirm, setConfirm] = useState("");

  async function wipe() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/danger/wipe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope, confirm }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "失敗");
      setMsg({
        type: "ok",
        text: "削除しました（直前の状態は自動バックアップ済み）。",
      });
      setConfirm("");
      onDone();
    } catch (e) {
      setMsg({ type: "err", text: e instanceof Error ? e.message : "失敗" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-6 rounded-2xl border-2 border-red-200 bg-red-50/40 p-6">
      <h2 className="text-lg font-semibold text-red-700">
        データ削除（危険ゾーン）
      </h2>
      <p className="mt-1 text-sm text-slate-600">
        実行前に自動でバックアップを取得します。万一のときは上の「復元」で戻せます。
      </p>

      <div className="mt-4 space-y-2">
        <label className="flex items-start gap-2 text-sm">
          <input
            type="radio"
            name="scope"
            className="mt-1"
            checked={scope === "transactions"}
            onChange={() => {
              setScope("transactions");
              setConfirm("");
            }}
          />
          <span>
            <span className="font-medium">利用記録と履歴のみ削除</span>
            <br />
            <span className="text-slate-500">
              利用記録・シーン紐づけ・監査ログを削除（カメラマン/カード/シーンのマスタは残す）
            </span>
          </span>
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="radio"
            name="scope"
            className="mt-1"
            checked={scope === "all"}
            onChange={() => {
              setScope("all");
              setConfirm("");
            }}
          />
          <span>
            <span className="font-medium">全データを初期化（マスタ含む）</span>
            <br />
            <span className="text-slate-500">
              上記に加えてマスタも削除（管理者アカウントは残す）
            </span>
          </span>
        </label>
      </div>

      <div className="mt-4">
        <label className="block text-sm font-medium text-red-700">
          確認のため「{PHRASE[scope]}」と入力してください
        </label>
        <input
          className="field mt-1 max-w-sm"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder={PHRASE[scope]}
        />
      </div>

      <button
        onClick={wipe}
        disabled={busy || confirm.trim() !== PHRASE[scope]}
        className="mt-4 rounded-lg bg-red-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-40"
      >
        削除を実行する
      </button>
    </section>
  );
}
