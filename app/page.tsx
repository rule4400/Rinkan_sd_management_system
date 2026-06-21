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
  sceneName?: string | null;
};

type Action = "checkout" | "spare" | "submit";
type Step = "cameraman" | "action" | "card" | "confirm" | "scene" | "done";

const ACTION_LABEL: Record<Action, string> = {
  checkout: "持ち出し",
  spare: "予備",
  submit: "提出",
};
const ACTION_COLOR: Record<Action, string> = {
  checkout: "bg-blue-600 text-white",
  spare: "bg-amber-500 text-white",
  submit: "bg-emerald-600 text-white",
};

export default function RegisterPage() {
  const [step, setStep] = useState<Step>("cameraman");
  const [cameramen, setCameramen] = useState<Cameraman[]>([]);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);

  const [cameraman, setCameraman] = useState<Cameraman | null>(null);
  const [action, setAction] = useState<Action | null>(null);
  const [card, setCard] = useState<Candidate | null>(null);
  const [scene, setScene] = useState<Scene | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [doneSummary, setDoneSummary] = useState<string>("");

  useEffect(() => {
    fetch("/api/cameramen")
      .then((r) => r.json())
      .then(setCameramen)
      .catch(() => setError("カメラマン一覧の取得に失敗しました"));
  }, []);

  const loadCandidates = useCallback(
    async (mode: Action, cm: Cameraman) => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/cards/candidates?mode=${mode}&cameramanId=${cm.id}`,
        );
        const data = await res.json();
        setCandidates(data);
      } catch {
        setError("カード一覧の取得に失敗しました");
      } finally {
        setLoading(false);
      }
    },
    [],
  );

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
    setScene(null);
    setError(null);
    setDoneSummary("");
  }

  function restartSameCameraman() {
    setAction(null);
    setCard(null);
    setScene(null);
    setError(null);
    setDoneSummary("");
    setStep("action");
  }

  // 確認後の確定処理
  async function confirmAndProceed() {
    if (action === "spare") {
      await doSubmitRequest();
    } else {
      // 持ち出し・提出はシーン選択へ
      await loadScenes();
      setStep("scene");
    }
  }

  async function doSubmitRequest(selectedScene?: Scene) {
    if (!cameraman || !action || !card) return;
    setLoading(true);
    setError(null);
    try {
      let url = "";
      let body: Record<string, number> = {};
      if (action === "checkout") {
        if (card.origin === "spare" && card.usageRecordId) {
          url = "/api/usage/spare-to-checkout";
          body = { usageRecordId: card.usageRecordId, sceneId: selectedScene!.id };
        } else {
          url = "/api/usage/checkout";
          body = {
            cameramanId: cameraman.id,
            cardId: card.cardId,
            sceneId: selectedScene!.id,
          };
        }
      } else if (action === "spare") {
        url = "/api/usage/spare";
        body = { cameramanId: cameraman.id, cardId: card.cardId };
      } else {
        url = "/api/usage/submit";
        body = { usageRecordId: card.usageRecordId!, sceneId: selectedScene!.id };
      }

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "登録に失敗しました");
      }
      const parts = [
        cameraman.name,
        ACTION_LABEL[action],
        `カード ${card.label}`,
      ];
      if (selectedScene) parts.push(`シーン「${selectedScene.name}」`);
      setDoneSummary(parts.join(" / "));
      setStep("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "登録に失敗しました");
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
              <span className="badge bg-slate-200 text-slate-700">
                {card.label}
              </span>
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
              {(["checkout", "spare", "submit"] as Action[]).map((a) => (
                <button
                  key={a}
                  className={`tap-btn ${ACTION_COLOR[a]} text-xl`}
                  onClick={async () => {
                    setAction(a);
                    setCard(null);
                    await loadCandidates(a, cameraman);
                    setStep("card");
                  }}
                >
                  {ACTION_LABEL[a]}
                </button>
              ))}
            </div>
          </Section>
        )}

        {step === "card" && (
          <Section
            title={
              action === "submit" ? "提出するカードを選択" : "カードNoを選択"
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
                      {c.status === "checked_out" ? "持ち出し中" : "予備保持中"}
                      {c.sceneName ? ` / ${c.sceneName}` : ""}
                    </span>
                  )}
                </button>
              ))}
            </Grid>
            {!loading && candidates.length === 0 && (
              <Empty>
                {action === "submit"
                  ? "提出できるカード（あなたが保持中のカード）がありません。"
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
              {action === "spare"
                ? "この内容で登録する"
                : "次へ（シーン選択）"}
            </button>
          </Section>
        )}

        {step === "scene" && (
          <Section
            title={
              action === "submit"
                ? "撮影したシーンを選択"
                : "撮影予定シーンを選択"
            }
            onBack={() => setStep("confirm")}
          >
            {loading && <Loading />}
            <Grid>
              {scenes.map((s) => (
                <button
                  key={s.id}
                  className="tap-btn flex-col gap-0.5"
                  onClick={() => {
                    setScene(s);
                    doSubmitRequest(s);
                  }}
                >
                  <span>{s.name}</span>
                  {s.code && (
                    <span className="text-xs text-slate-400">{s.code}</span>
                  )}
                </button>
              ))}
            </Grid>
            {scenes.length === 0 && !loading && (
              <Empty>シーンが未登録です。管理画面から登録してください。</Empty>
            )}
          </Section>
        )}

        {step === "done" && (
          <Section title="登録が完了しました">
            <div className="rounded-2xl bg-emerald-50 p-6 text-center shadow-sm">
              <div className="text-5xl">✓</div>
              <p className="mt-3 text-sm text-slate-700">{doneSummary}</p>
            </div>
            <div className="mt-6 grid grid-cols-1 gap-3">
              <button
                className="tap-btn-primary"
                onClick={restartSameCameraman}
              >
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
