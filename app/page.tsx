"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

type Cameraman = { id: number; name: string };
type Scene = { id: number; name: string; code: string | null };
type Candidate = {
  cardId: number;
  label: string;
  note: string | null;
  origin?: "available" | "spare";
  usageRecordId?: number;
  status?: string;
  sceneNames?: string[];
};

type Action = "checkout" | "spare" | "provisional" | "submit";
type Step = "cameraman" | "action" | "card" | "confirm" | "scene" | "done";

const ACTIONS: Action[] = ["checkout", "spare", "provisional", "submit"];

const ACTION_LABEL: Record<Action, string> = {
  checkout: "持ち出し",
  spare: "予備",
  provisional: "仮提出",
  submit: "提出",
};
const ACTION_DESC: Record<Action, string> = {
  checkout: "これから撮影に使う",
  spare: "予備として確保",
  provisional: "撮影は完了・カードはまだ手元",
  submit: "カードを正式に提出する",
};
const ACTION_COLOR: Record<Action, string> = {
  checkout: "bg-blue-600 text-white",
  spare: "bg-amber-500 text-white",
  provisional: "bg-violet-600 text-white",
  submit: "bg-emerald-600 text-white",
};
const STATUS_LABEL: Record<string, string> = {
  spare_held: "予備保持中",
  checked_out: "持ち出し中",
  provisional: "仮提出",
};

// シーンを選ぶ操作か（予備のみシーン不要）
const NEEDS_SCENE: Record<Action, boolean> = {
  checkout: true,
  spare: false,
  provisional: true,
  submit: true,
};

export default function RegisterPage() {
  const [step, setStep] = useState<Step>("cameraman");
  const [cameramen, setCameramen] = useState<Cameraman[]>([]);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);

  const [cameraman, setCameraman] = useState<Cameraman | null>(null);
  const [action, setAction] = useState<Action | null>(null);
  const [card, setCard] = useState<Candidate | null>(null);
  const [sceneSel, setSceneSel] = useState<number[]>([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [doneSummary, setDoneSummary] = useState<string>("");
  const [lastRecordId, setLastRecordId] = useState<number | null>(null);
  const [undone, setUndone] = useState(false);

  useEffect(() => {
    fetch("/api/cameramen")
      .then((r) => r.json())
      .then(setCameramen)
      .catch(() => setError("カメラマン一覧の取得に失敗しました"));
  }, []);

  const loadCandidates = useCallback(async (mode: Action, cm: Cameraman) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/cards/candidates?mode=${mode}&cameramanId=${cm.id}`,
      );
      setCandidates(await res.json());
    } catch {
      setError("カード一覧の取得に失敗しました");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadScenes = useCallback(async () => {
    if (scenes.length) return;
    const res = await fetch("/api/scenes");
    setScenes(await res.json());
  }, [scenes.length]);

  function reset() {
    setStep("cameraman");
    setCameraman(null);
    setAction(null);
    setCard(null);
    setSceneSel([]);
    setError(null);
    setDoneSummary("");
    setLastRecordId(null);
    setUndone(false);
  }

  function restartSameCameraman() {
    setAction(null);
    setCard(null);
    setSceneSel([]);
    setError(null);
    setDoneSummary("");
    setLastRecordId(null);
    setUndone(false);
    setStep("action");
  }

  // 確認後：シーンが必要なら選択へ、不要（予備）ならそのまま登録
  async function confirmAndProceed() {
    if (action && NEEDS_SCENE[action]) {
      await loadScenes();
      setSceneSel([]);
      setStep("scene");
    } else {
      await doSubmitRequest([]);
    }
  }

  function toggleScene(id: number) {
    setSceneSel((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  async function doSubmitRequest(sceneIds: number[]) {
    if (!cameraman || !action || !card) return;
    setLoading(true);
    setError(null);
    try {
      let url = "";
      let body: Record<string, unknown> = {};
      if (action === "checkout") {
        if (card.origin === "spare" && card.usageRecordId) {
          url = "/api/usage/spare-to-checkout";
          body = { usageRecordId: card.usageRecordId, sceneIds };
        } else {
          url = "/api/usage/checkout";
          body = { cameramanId: cameraman.id, cardId: card.cardId, sceneIds };
        }
      } else if (action === "spare") {
        url = "/api/usage/spare";
        body = { cameramanId: cameraman.id, cardId: card.cardId };
      } else if (action === "provisional") {
        url = "/api/usage/provisional";
        body = { usageRecordId: card.usageRecordId, sceneIds };
      } else {
        url = "/api/usage/submit";
        body = { usageRecordId: card.usageRecordId, sceneIds };
      }

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || "登録に失敗しました");

      const sceneNames = sceneIds
        .map((id) => scenes.find((s) => s.id === id)?.name)
        .filter(Boolean);
      const parts = [cameraman.name, ACTION_LABEL[action], `カード ${card.label}`];
      if (sceneNames.length) parts.push(`シーン「${sceneNames.join("・")}」`);
      setDoneSummary(parts.join(" / "));
      setLastRecordId(typeof j.id === "number" ? j.id : null);
      setUndone(false);
      setStep("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "登録に失敗しました");
    } finally {
      setLoading(false);
    }
  }

  async function undoLast() {
    if (lastRecordId == null) return;
    if (!confirm("直前の操作を取り消します。よろしいですか？")) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/usage/undo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usageRecordId: lastRecordId }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || "取り消しに失敗しました");
      setUndone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "取り消しに失敗しました");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col px-4 pb-10">
      <header className="sticky top-0 z-10 -mx-4 bg-slate-100/90 px-4 py-3 backdrop-blur">
        <div className="flex items-center justify-between">
          <h1 className="text-base font-bold">SDカード管理</h1>
          <Link
            href="/admin"
            className="text-xs text-slate-500 underline underline-offset-2"
          >
            管理画面
          </Link>
        </div>
        {cameraman && (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
            <span className="badge bg-slate-800 text-white">{cameraman.name}</span>
            {action && (
              <span className={`badge ${ACTION_COLOR[action]}`}>
                {ACTION_LABEL[action]}
              </span>
            )}
            {card && (
              <span className="badge bg-slate-200 text-slate-700">{card.label}</span>
            )}
          </div>
        )}
      </header>

      {error && (
        <div className="mt-3 rounded-lg bg-red-100 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="mt-4 flex-1">
        {step === "cameraman" && (
          <Section title="カメラマンを選択">
            <Grid>
              {cameramen.map((c) => (
                <button
                  key={c.id}
                  className="tap-btn"
                  onClick={() => {
                    setCameraman(c);
                    setStep("action");
                  }}
                >
                  {c.name}
                </button>
              ))}
            </Grid>
            {cameramen.length === 0 && (
              <Empty>カメラマンが未登録です。管理画面から登録してください。</Empty>
            )}
          </Section>
        )}

        {step === "action" && cameraman && (
          <Section title="操作を選択" onBack={reset}>
            <div className="grid grid-cols-1 gap-3">
              {ACTIONS.map((a) => (
                <button
                  key={a}
                  className={`tap-btn ${ACTION_COLOR[a]} flex-col gap-0.5 text-xl`}
                  onClick={async () => {
                    setAction(a);
                    setCard(null);
                    await loadCandidates(a, cameraman);
                    setStep("card");
                  }}
                >
                  {ACTION_LABEL[a]}
                  <span className="text-xs font-normal opacity-90">
                    {ACTION_DESC[a]}
                  </span>
                </button>
              ))}
            </div>
          </Section>
        )}

        {step === "card" && action && (
          <Section
            title={
              action === "submit"
                ? "提出するカードを選択"
                : action === "provisional"
                  ? "仮提出するカードを選択"
                  : "カードNoを選択"
            }
            onBack={() => setStep("action")}
          >
            {loading && <Loading />}
            <Grid>
              {candidates.map((c) => (
                <button
                  key={c.cardId + (c.usageRecordId ?? 0)}
                  className="tap-btn flex-col gap-1"
                  onClick={() => {
                    setCard(c);
                    setStep("confirm");
                  }}
                >
                  <span>{c.label}</span>
                  {c.origin === "spare" && (
                    <span className="badge bg-amber-100 text-amber-700">
                      予備から
                    </span>
                  )}
                  {c.status && (
                    <span className="badge bg-slate-200 text-slate-600">
                      {STATUS_LABEL[c.status] ?? c.status}
                      {c.sceneNames && c.sceneNames.length
                        ? ` / ${c.sceneNames.join("・")}`
                        : ""}
                    </span>
                  )}
                </button>
              ))}
            </Grid>
            {!loading && candidates.length === 0 && (
              <Empty>
                {action === "submit"
                  ? "提出できるカード（あなたが保持中のカード）がありません。"
                  : action === "provisional"
                    ? "仮提出できるカード（持ち出し中・予備のカード）がありません。"
                    : "選択できるカードがありません。"}
              </Empty>
            )}
          </Section>
        )}

        {step === "confirm" && card && action && (
          <Section title="内容を確認" onBack={() => setStep("card")}>
            <div className="rounded-2xl bg-white p-5 shadow-sm">
              <Row label="カメラマン" value={cameraman?.name ?? ""} />
              <Row label="操作" value={ACTION_LABEL[action]} />
              <Row label="カードNo" value={card.label} />
              {card.origin === "spare" && (
                <Row label="区分" value="予備からの持ち出し" />
              )}
            </div>
            <button
              className={`tap-btn-primary mt-5 w-full text-xl ${loading ? "opacity-60" : ""}`}
              disabled={loading}
              onClick={confirmAndProceed}
            >
              {NEEDS_SCENE[action] ? "次へ（シーン選択）" : "この内容で登録する"}
            </button>
          </Section>
        )}

        {step === "scene" && action && (
          <Section
            title={
              action === "submit"
                ? "撮影したシーンを選択（複数可）"
                : action === "provisional"
                  ? "撮影したシーンを選択（複数可）"
                  : "撮影予定シーンを選択（複数可）"
            }
            onBack={() => setStep("confirm")}
          >
            {loading && <Loading />}
            <Grid>
              {scenes.map((s) => {
                const on = sceneSel.includes(s.id);
                return (
                  <button
                    key={s.id}
                    className={`tap-btn flex-col gap-0.5 ${
                      on ? "ring-2 ring-brand ring-offset-2" : ""
                    }`}
                    onClick={() => toggleScene(s.id)}
                  >
                    <span>
                      {on ? "✓ " : ""}
                      {s.name}
                    </span>
                    {s.code && (
                      <span className="text-xs text-slate-400">{s.code}</span>
                    )}
                  </button>
                );
              })}
            </Grid>
            {scenes.length === 0 && !loading && (
              <Empty>シーンが未登録です。管理画面から登録してください。</Empty>
            )}
            <button
              className={`tap-btn-primary mt-5 w-full text-xl ${
                loading || sceneSel.length === 0 ? "opacity-50" : ""
              }`}
              disabled={loading || sceneSel.length === 0}
              onClick={() => doSubmitRequest(sceneSel)}
            >
              この内容で登録する（{sceneSel.length} シーン）
            </button>
          </Section>
        )}

        {step === "done" && (
          <Section title={undone ? "取り消しました" : "登録が完了しました"}>
            <div
              className={`rounded-2xl p-6 text-center shadow-sm ${
                undone ? "bg-slate-100" : "bg-emerald-50"
              }`}
            >
              <div className="text-5xl">{undone ? "↩" : "✓"}</div>
              <p className="mt-3 text-sm text-slate-700">
                {undone ? "直前の操作を取り消しました。" : doneSummary}
              </p>
            </div>

            {!undone && lastRecordId != null && (
              <button
                className="mt-4 w-full rounded-xl border border-slate-300 bg-white py-3 text-sm font-medium text-slate-700 disabled:opacity-60"
                disabled={loading}
                onClick={undoLast}
              >
                ↩ この操作を取り消す（やり直す）
              </button>
            )}

            <div className="mt-4 grid grid-cols-1 gap-3">
              <button className="tap-btn-primary" onClick={restartSameCameraman}>
                続けて操作する（{cameraman?.name}）
              </button>
              <button className="tap-btn" onClick={reset}>
                最初に戻る
              </button>
            </div>
          </Section>
        )}
      </div>
    </main>
  );
}

function Section({
  title,
  children,
  onBack,
}: {
  title: string;
  children: React.ReactNode;
  onBack?: () => void;
}) {
  return (
    <section>
      <div className="mb-3 flex items-center gap-2">
        {onBack && (
          <button
            onClick={onBack}
            className="rounded-lg bg-slate-200 px-3 py-1 text-sm"
          >
            ← 戻る
          </button>
        )}
        <h2 className="text-lg font-bold">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-3">{children}</div>;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b border-slate-100 py-2 last:border-0">
      <span className="text-slate-500">{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-white p-4 text-center text-sm text-slate-500 shadow-sm">
      {children}
    </div>
  );
}

function Loading() {
  return <div className="py-6 text-center text-sm text-slate-400">読み込み中…</div>;
}
