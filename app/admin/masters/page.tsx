"use client";

import { useCallback, useEffect, useState } from "react";

type Tab = "cameramen" | "cards" | "scenes";

type FieldDef = {
  key: string;
  label: string;
  type: "text" | "number";
  required?: boolean;
};

const CONFIG: Record<
  Tab,
  { title: string; endpoint: string; fields: FieldDef[] }
> = {
  cameramen: {
    title: "カメラマン",
    endpoint: "/api/admin/cameramen",
    fields: [
      { key: "name", label: "名前", type: "text", required: true },
      { key: "sortOrder", label: "並び順", type: "number" },
    ],
  },
  cards: {
    title: "カード",
    endpoint: "/api/admin/cards",
    fields: [
      { key: "label", label: "カードNo", type: "text", required: true },
      { key: "note", label: "メモ", type: "text" },
      { key: "sortOrder", label: "並び順", type: "number" },
    ],
  },
  scenes: {
    title: "シーン",
    endpoint: "/api/admin/scenes",
    fields: [
      { key: "name", label: "シーン名", type: "text", required: true },
      { key: "code", label: "コード", type: "text" },
      { key: "sortOrder", label: "並び順", type: "number" },
    ],
  },
};

type Item = Record<string, unknown> & {
  id: number;
  active: boolean;
};

export default function MastersPage() {
  const [tab, setTab] = useState<Tab>("cameramen");

  return (
    <div>
      <h1 className="text-2xl font-bold">マスタ管理</h1>
      <p className="mt-1 text-sm text-slate-500">
        カメラマン・カード・シーンを登録します。登録した内容が登録画面の選択肢になります。
      </p>

      <div className="mt-4 flex gap-2">
        {(Object.keys(CONFIG) as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-lg px-4 py-2 text-sm ${
              tab === t ? "bg-brand text-white" : "bg-white text-slate-600 shadow-sm"
            }`}
          >
            {CONFIG[t].title}
          </button>
        ))}
      </div>

      <MasterManager key={tab} tab={tab} />
    </div>
  );
}

function MasterManager({ tab }: { tab: Tab }) {
  const cfg = CONFIG[tab];
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(cfg.endpoint);
      setItems(await res.json());
    } finally {
      setLoading(false);
    }
  }, [cfg.endpoint]);

  useEffect(() => {
    load();
  }, [load]);

  function buildPayload(src: Record<string, string>) {
    const payload: Record<string, unknown> = {};
    for (const f of cfg.fields) {
      const v = src[f.key];
      if (v === undefined || v === "") {
        if (f.type === "number") continue;
        payload[f.key] = f.type === "text" ? "" : v;
        continue;
      }
      payload[f.key] = f.type === "number" ? Number(v) : v;
    }
    return payload;
  }

  async function add() {
    setError(null);
    const required = cfg.fields.filter((f) => f.required);
    for (const f of required) {
      if (!form[f.key]?.trim()) {
        setError(`${f.label}は必須です`);
        return;
      }
    }
    const res = await fetch(cfg.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildPayload(form)),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error || "登録に失敗しました");
      return;
    }
    setForm({});
    load();
  }

  async function toggleActive(item: Item) {
    await fetch(`${cfg.endpoint}/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !item.active }),
    });
    load();
  }

  async function saveEdit(id: number) {
    const res = await fetch(`${cfg.endpoint}/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildPayload(editForm)),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error || "更新に失敗しました");
      return;
    }
    setEditingId(null);
    load();
  }

  async function remove(id: number) {
    if (!confirm("削除します（利用履歴があれば無効化されます）。よろしいですか？")) return;
    await fetch(`${cfg.endpoint}/${id}`, { method: "DELETE" });
    load();
  }

  function startEdit(item: Item) {
    setEditingId(item.id);
    const f: Record<string, string> = {};
    for (const fd of cfg.fields) {
      const v = item[fd.key];
      f[fd.key] = v == null ? "" : String(v);
    }
    setEditForm(f);
  }

  return (
    <div className="mt-4">
      {error && (
        <div className="mb-3 rounded-lg bg-red-100 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* CSV テンプレート / インポート */}
      <CsvPanel tab={tab} onImported={load} />

      {/* 新規追加 */}
      <div className="rounded-2xl bg-white p-4 shadow-sm">
        <div className="mb-2 text-sm font-medium">新規登録</div>
        <div className="flex flex-wrap items-end gap-3">
          {cfg.fields.map((f) => (
            <div key={f.key} className="flex flex-col">
              <span className="mb-1 text-xs text-slate-500">
                {f.label}
                {f.required && <span className="text-red-500">*</span>}
              </span>
              <input
                type={f.type === "number" ? "number" : "text"}
                className="field w-40"
                value={form[f.key] ?? ""}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, [f.key]: e.target.value }))
                }
              />
            </div>
          ))}
          <button
            onClick={add}
            className="rounded-lg bg-brand px-5 py-2 text-sm text-white"
          >
            追加
          </button>
        </div>
      </div>

      {/* 一覧 */}
      <div className="mt-4 overflow-x-auto rounded-2xl bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-3 py-2 font-medium">ID</th>
              {cfg.fields.map((f) => (
                <th key={f.key} className="px-3 py-2 font-medium">
                  {f.label}
                </th>
              ))}
              <th className="px-3 py-2 font-medium">状態</th>
              <th className="px-3 py-2 font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-t border-slate-100">
                <td className="px-3 py-2">{item.id}</td>
                {cfg.fields.map((f) => (
                  <td key={f.key} className="px-3 py-2">
                    {editingId === item.id ? (
                      <input
                        type={f.type === "number" ? "number" : "text"}
                        className="field w-32"
                        value={editForm[f.key] ?? ""}
                        onChange={(e) =>
                          setEditForm((prev) => ({
                            ...prev,
                            [f.key]: e.target.value,
                          }))
                        }
                      />
                    ) : (
                      String(item[f.key] ?? "")
                    )}
                  </td>
                ))}
                <td className="px-3 py-2">
                  <button
                    onClick={() => toggleActive(item)}
                    className={`badge ${
                      item.active
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-slate-200 text-slate-500"
                    }`}
                  >
                    {item.active ? "有効" : "無効"}
                  </button>
                </td>
                <td className="px-3 py-2">
                  {editingId === item.id ? (
                    <div className="flex gap-1">
                      <button
                        onClick={() => saveEdit(item.id)}
                        className="rounded-md bg-brand px-3 py-1 text-xs text-white"
                      >
                        保存
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="rounded-md bg-slate-100 px-3 py-1 text-xs"
                      >
                        取消
                      </button>
                    </div>
                  ) : (
                    <div className="flex gap-1">
                      <button
                        onClick={() => startEdit(item)}
                        className="rounded-md bg-slate-100 px-3 py-1 text-xs hover:bg-slate-200"
                      >
                        編集
                      </button>
                      <button
                        onClick={() => remove(item.id)}
                        className="rounded-md px-3 py-1 text-xs text-red-600 hover:bg-red-50"
                      >
                        削除
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {items.length === 0 && !loading && (
              <tr>
                <td
                  colSpan={cfg.fields.length + 3}
                  className="p-6 text-center text-slate-400"
                >
                  未登録です
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// CSV テンプレートのダウンロードと一括インポート
function CsvPanel({
  tab,
  onImported,
}: {
  tab: Tab;
  onImported: () => void;
}) {
  const [result, setResult] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // 同じファイルを選び直せるようにリセット
    if (!file) return;
    setImporting(true);
    setResult(null);
    try {
      const csv = await file.text();
      const res = await fetch("/api/admin/masters/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: tab, csv }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "インポートに失敗しました");
      const errs = j.errors?.length ? ` / エラー${j.errors.length}件` : "";
      setResult(`登録 ${j.created} 件・スキップ ${j.skipped} 件${errs}`);
      onImported();
    } catch (err) {
      setResult(err instanceof Error ? err.message : "インポートに失敗しました");
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="mb-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <a
          href={`/api/admin/masters/template?type=${tab}`}
          className="rounded-lg bg-slate-800 px-4 py-2 text-sm text-white"
        >
          CSVテンプレートをダウンロード
        </a>
        <label className="cursor-pointer rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm hover:bg-slate-100">
          {importing ? "インポート中…" : "CSVを取り込む"}
          <input
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={onFile}
            disabled={importing}
          />
        </label>
        {result && <span className="text-sm text-slate-600">{result}</span>}
      </div>
      <p className="mt-2 text-xs text-slate-500">
        テンプレートの1行目はヘッダです。2行目以降に記入して取り込んでください（記入例の行は置き換え/削除）。
        既存（カメラマン名・カードNo・シーン名）と重複する行はスキップされます。
      </p>
    </div>
  );
}
