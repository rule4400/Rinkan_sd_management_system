"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

type Option = { id: number; name?: string; label?: string };
type SceneRef = { id: number; name: string };
type Row = {
  id: number;
  status: string;
  kind: string;
  checkedOutAt: string | null;
  spareAt: string | null;
  provisionalAt: string | null;
  submittedAt: string | null;
  note: string | null;
  card: { id: number; label: string };
  cameraman: { id: number; name: string };
  scene: { id: number; name: string } | null;
  scenes: SceneRef[];
};

const STATUS: { value: string; label: string; cls: string }[] = [
  { value: "spare_held", label: "予備保持中", cls: "bg-amber-100 text-amber-700" },
  { value: "checked_out", label: "持ち出し中", cls: "bg-blue-100 text-blue-700" },
  { value: "provisional", label: "仮提出", cls: "bg-violet-100 text-violet-700" },
  { value: "submitted", label: "提出済み", cls: "bg-emerald-100 text-emerald-700" },
];

function sceneText(r: Row): string {
  if (r.scenes && r.scenes.length) return r.scenes.map((s) => s.name).join(" / ");
  return r.scene?.name ?? "—";
}

function fmt(v: string | null): string {
  if (!v) return "—";
  return new Date(v).toLocaleString("ja-JP", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function toIso(local: string): string | null {
  if (!local) return null;
  const d = new Date(local);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

export default function RecordsPage() {
  return (
    <Suspense fallback={<div className="text-slate-400">読み込み中…</div>}>
      <RecordsInner />
    </Suspense>
  );
}

function RecordsInner() {
  const searchParams = useSearchParams();

  const [cameramen, setCameramen] = useState<Option[]>([]);
  const [cards, setCards] = useState<Option[]>([]);
  const [scenes, setScenes] = useState<Option[]>([]);

  // フィルタ状態
  const [coFrom, setCoFrom] = useState("");
  const [coTo, setCoTo] = useState("");
  const [subFrom, setSubFrom] = useState("");
  const [subTo, setSubTo] = useState("");
  const [cameramanIds, setCameramanIds] = useState<number[]>([]);
  const [cardIds, setCardIds] = useState<number[]>([]);
  const [sceneIds, setSceneIds] = useState<number[]>([]);
  const [statuses, setStatuses] = useState<string[]>(() => {
    const s = searchParams.get("status");
    return s ? s.split(",") : [];
  });
  const [q, setQ] = useState("");

  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);

  useEffect(() => {
    fetch("/api/admin/cameramen").then((r) => r.json()).then(setCameramen);
    fetch("/api/admin/cards").then((r) => r.json()).then(setCards);
    fetch("/api/admin/scenes").then((r) => r.json()).then(setScenes);
  }, []);

  const queryString = useMemo(() => {
    const p = new URLSearchParams();
    const co1 = toIso(coFrom);
    const co2 = toIso(coTo);
    const su1 = toIso(subFrom);
    const su2 = toIso(subTo);
    if (co1) p.set("checkedOutFrom", co1);
    if (co2) p.set("checkedOutTo", co2);
    if (su1) p.set("submittedFrom", su1);
    if (su2) p.set("submittedTo", su2);
    if (cameramanIds.length) p.set("cameramanIds", cameramanIds.join(","));
    if (cardIds.length) p.set("cardIds", cardIds.join(","));
    if (sceneIds.length) p.set("sceneIds", sceneIds.join(","));
    if (statuses.length) p.set("status", statuses.join(","));
    if (q.trim()) p.set("q", q.trim());
    return p.toString();
  }, [coFrom, coTo, subFrom, subTo, cameramanIds, cardIds, sceneIds, statuses, q]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/records?${queryString}`);
      const data = await res.json();
      setRows(data.rows ?? []);
      setTotal(data.total ?? 0);
    } finally {
      setLoading(false);
    }
  }, [queryString]);

  useEffect(() => {
    load();
  }, [load]);

  function resetFilters() {
    setCoFrom("");
    setCoTo("");
    setSubFrom("");
    setSubTo("");
    setCameramanIds([]);
    setCardIds([]);
    setSceneIds([]);
    setStatuses([]);
    setQ("");
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">利用記録</h1>
        <a
          href={`/api/admin/records/export?${queryString}`}
          className="rounded-lg bg-slate-800 px-4 py-2 text-sm text-white"
        >
          CSVエクスポート（現在の絞り込み）
        </a>
      </div>

      {/* フィルタ */}
      <div className="mt-4 rounded-2xl bg-white p-4 shadow-sm">
        <div className="grid gap-4 md:grid-cols-2">
          <DateRange
            label="持ち出し日時"
            from={coFrom}
            to={coTo}
            setFrom={setCoFrom}
            setTo={setCoTo}
          />
          <DateRange
            label="提出日時"
            from={subFrom}
            to={subTo}
            setFrom={setSubFrom}
            setTo={setSubTo}
          />
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <MultiSelect
            label="カメラマン"
            options={cameramen.map((c) => ({ id: c.id, text: c.name! }))}
            selected={cameramanIds}
            onChange={setCameramanIds}
          />
          <MultiSelect
            label="カードNo"
            options={cards.map((c) => ({ id: c.id, text: c.label! }))}
            selected={cardIds}
            onChange={setCardIds}
          />
          <MultiSelect
            label="シーン"
            options={scenes.map((c) => ({ id: c.id, text: c.name! }))}
            selected={sceneIds}
            onChange={setSceneIds}
          />
        </div>

        <div className="mt-4 flex flex-wrap items-end gap-4">
          <div>
            <div className="mb-1 text-sm font-medium">状態</div>
            <div className="flex flex-wrap gap-2">
              {STATUS.map((s) => {
                const on = statuses.includes(s.value);
                return (
                  <button
                    key={s.value}
                    onClick={() =>
                      setStatuses((prev) =>
                        on
                          ? prev.filter((x) => x !== s.value)
                          : [...prev, s.value],
                      )
                    }
                    className={`badge border px-3 py-1 ${
                      on ? s.cls + " border-transparent" : "border-slate-300 text-slate-500"
                    }`}
                  >
                    {s.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex-1 min-w-[180px]">
            <div className="mb-1 text-sm font-medium">フリーワード</div>
            <input
              className="field"
              placeholder="カードNo・シーン名・備考"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <button
            onClick={resetFilters}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm"
          >
            条件をクリア
          </button>
        </div>
      </div>

      {/* 件数 */}
      <div className="mt-4 text-sm text-slate-500">
        {loading ? "検索中…" : `${total} 件`}
      </div>

      {/* テーブル（PC） */}
      <div className="mt-2 hidden overflow-x-auto rounded-2xl bg-white shadow-sm md:block">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <Th>No</Th>
              <Th>状態</Th>
              <Th>持ち出し日時</Th>
              <Th>提出日時</Th>
              <Th>カメラマン</Th>
              <Th>カードNo</Th>
              <Th>シーン</Th>
              <Th>操作</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-slate-100">
                <Td>{r.id}</Td>
                <Td>
                  <StatusBadge status={r.status} />
                </Td>
                <Td>{fmt(r.checkedOutAt)}</Td>
                <Td>{fmt(r.submittedAt)}</Td>
                <Td>{r.cameraman.name}</Td>
                <Td>{r.card.label}</Td>
                <Td>{sceneText(r)}</Td>
                <Td>
                  <button
                    onClick={() => setEditing(r)}
                    className="rounded-md bg-slate-100 px-3 py-1 text-xs hover:bg-slate-200"
                  >
                    修正
                  </button>
                </Td>
              </tr>
            ))}
            {rows.length === 0 && !loading && (
              <tr>
                <td colSpan={8} className="p-6 text-center text-slate-400">
                  該当する記録がありません
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* カード型（スマホ） */}
      <div className="mt-2 grid gap-3 md:hidden">
        {rows.map((r) => (
          <div key={r.id} className="rounded-xl bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400">No.{r.id}</span>
              <StatusBadge status={r.status} />
            </div>
            <div className="mt-2 grid grid-cols-2 gap-1 text-sm">
              <span className="text-slate-500">カメラマン</span>
              <span className="text-right font-medium">{r.cameraman.name}</span>
              <span className="text-slate-500">カードNo</span>
              <span className="text-right font-medium">{r.card.label}</span>
              <span className="text-slate-500">シーン</span>
              <span className="text-right">{sceneText(r)}</span>
              <span className="text-slate-500">持ち出し</span>
              <span className="text-right">{fmt(r.checkedOutAt)}</span>
              <span className="text-slate-500">提出</span>
              <span className="text-right">{fmt(r.submittedAt)}</span>
            </div>
            <button
              onClick={() => setEditing(r)}
              className="mt-3 w-full rounded-md bg-slate-100 py-2 text-sm"
            >
              修正
            </button>
          </div>
        ))}
      </div>

      {editing && (
        <EditModal
          row={editing}
          cameramen={cameramen}
          cards={cards}
          scenes={scenes}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="whitespace-nowrap px-3 py-2 font-medium">{children}</th>;
}
function Td({ children }: { children: React.ReactNode }) {
  return <td className="whitespace-nowrap px-3 py-2">{children}</td>;
}

function StatusBadge({ status }: { status: string }) {
  const s = STATUS.find((x) => x.value === status);
  return (
    <span className={`badge ${s?.cls ?? "bg-slate-100 text-slate-600"}`}>
      {s?.label ?? status}
    </span>
  );
}

function DateRange({
  label,
  from,
  to,
  setFrom,
  setTo,
}: {
  label: string;
  from: string;
  to: string;
  setFrom: (v: string) => void;
  setTo: (v: string) => void;
}) {
  return (
    <div>
      <div className="mb-1 text-sm font-medium">{label}（範囲）</div>
      <div className="flex items-center gap-2">
        <input
          type="datetime-local"
          className="field"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
        />
        <span className="text-slate-400">〜</span>
        <input
          type="datetime-local"
          className="field"
          value={to}
          onChange={(e) => setTo(e.target.value)}
        />
      </div>
    </div>
  );
}

function MultiSelect({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: { id: number; text: string }[];
  selected: number[];
  onChange: (v: number[]) => void;
}) {
  function toggle(id: number) {
    onChange(
      selected.includes(id)
        ? selected.filter((x) => x !== id)
        : [...selected, id],
    );
  }
  return (
    <div>
      <div className="mb-1 text-sm font-medium">
        {label}
        {selected.length > 0 && (
          <span className="ml-1 text-xs text-brand">（{selected.length}）</span>
        )}
      </div>
      <div className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto rounded-lg border border-slate-200 p-2">
        {options.map((o) => {
          const on = selected.includes(o.id);
          return (
            <button
              key={o.id}
              onClick={() => toggle(o.id)}
              className={`badge border px-2.5 py-1 ${
                on
                  ? "border-transparent bg-brand text-white"
                  : "border-slate-300 text-slate-600"
              }`}
            >
              {o.text}
            </button>
          );
        })}
        {options.length === 0 && (
          <span className="text-xs text-slate-400">選択肢なし</span>
        )}
      </div>
    </div>
  );
}

function EditModal({
  row,
  cameramen,
  cards,
  scenes,
  onClose,
  onSaved,
}: {
  row: Row;
  cameramen: Option[];
  cards: Option[];
  scenes: Option[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const toLocal = (v: string | null) => {
    if (!v) return "";
    const d = new Date(v);
    const off = d.getTimezoneOffset();
    return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
  };

  const [cameramanId, setCameramanId] = useState(row.cameraman.id);
  const [cardId, setCardId] = useState(row.card.id);
  const [sceneIds, setSceneIds] = useState<number[]>(
    row.scenes?.length ? row.scenes.map((s) => s.id) : row.scene ? [row.scene.id] : [],
  );
  const [status, setStatus] = useState(row.status);
  const [checkedOutAt, setCheckedOutAt] = useState(toLocal(row.checkedOutAt));
  const [provisionalAt, setProvisionalAt] = useState(toLocal(row.provisionalAt));
  const [submittedAt, setSubmittedAt] = useState(toLocal(row.submittedAt));
  const [note, setNote] = useState(row.note ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function toggleScene(id: number) {
    setSceneIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const body = {
        cameramanId,
        cardId,
        sceneIds,
        status,
        checkedOutAt: checkedOutAt ? new Date(checkedOutAt).toISOString() : null,
        provisionalAt: provisionalAt ? new Date(provisionalAt).toISOString() : null,
        submittedAt: submittedAt ? new Date(submittedAt).toISOString() : null,
        note: note || null,
      };
      const res = await fetch(`/api/admin/records/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "保存に失敗しました");
      }
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存に失敗しました");
    } finally {
      setSaving(false);
    }
  }

  async function undo() {
    if (!confirm(`記録 No.${row.id} の直前の変更を元に戻します。よろしいですか？`))
      return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/usage/undo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usageRecordId: row.id }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "取り消しに失敗しました");
      }
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "取り消しに失敗しました");
      setSaving(false);
    }
  }

  async function remove() {
    if (!confirm(`記録 No.${row.id} を削除します。よろしいですか？`)) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/records/${row.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error();
      onSaved();
    } catch {
      setError("削除に失敗しました");
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">記録 No.{row.id} を修正</h2>
          <button onClick={onClose} className="text-slate-400">
            ✕
          </button>
        </div>

        {error && (
          <div className="mt-3 rounded-lg bg-red-100 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="mt-4 grid gap-3">
          <Labeled label="カメラマン">
            <select
              className="field"
              value={cameramanId}
              onChange={(e) => setCameramanId(Number(e.target.value))}
            >
              {cameramen.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Labeled>
          <Labeled label="カードNo">
            <select
              className="field"
              value={cardId}
              onChange={(e) => setCardId(Number(e.target.value))}
            >
              {cards.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </Labeled>
          <Labeled label={`シーン（複数選択可・${sceneIds.length}件）`}>
            <div className="flex flex-wrap gap-1.5 rounded-lg border border-slate-200 p-2">
              {scenes.map((c) => {
                const on = sceneIds.includes(c.id);
                return (
                  <button
                    type="button"
                    key={c.id}
                    onClick={() => toggleScene(c.id)}
                    className={`badge border px-2.5 py-1 ${
                      on
                        ? "border-transparent bg-brand text-white"
                        : "border-slate-300 text-slate-600"
                    }`}
                  >
                    {c.name}
                  </button>
                );
              })}
              {scenes.length === 0 && (
                <span className="text-xs text-slate-400">選択肢なし</span>
              )}
            </div>
          </Labeled>
          <Labeled label="状態">
            <select
              className="field"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              {STATUS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </Labeled>
          <Labeled label="持ち出し日時">
            <input
              type="datetime-local"
              className="field"
              value={checkedOutAt}
              onChange={(e) => setCheckedOutAt(e.target.value)}
            />
          </Labeled>
          <Labeled label="仮提出日時">
            <input
              type="datetime-local"
              className="field"
              value={provisionalAt}
              onChange={(e) => setProvisionalAt(e.target.value)}
            />
          </Labeled>
          <Labeled label="提出日時">
            <input
              type="datetime-local"
              className="field"
              value={submittedAt}
              onChange={(e) => setSubmittedAt(e.target.value)}
            />
          </Labeled>
          <Labeled label="備考">
            <input
              className="field"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </Labeled>
        </div>

        <div className="mt-5 flex items-center justify-between gap-2">
          <div className="flex gap-1">
            <button
              onClick={remove}
              disabled={saving}
              className="rounded-lg px-4 py-2 text-sm text-red-600 hover:bg-red-50"
            >
              削除
            </button>
            <button
              onClick={undo}
              disabled={saving}
              className="rounded-lg px-4 py-2 text-sm text-slate-600 hover:bg-slate-100"
              title="この記録の直前の操作・変更を取り消します"
            >
              ↩ 元に戻す
            </button>
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm"
            >
              キャンセル
            </button>
            <button
              onClick={save}
              disabled={saving}
              className="rounded-lg bg-brand px-5 py-2 text-sm text-white disabled:opacity-60"
            >
              {saving ? "保存中…" : "保存"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Labeled({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">{label}</span>
      {children}
    </label>
  );
}
