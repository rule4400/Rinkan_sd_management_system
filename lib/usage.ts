import { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { AppError } from "./api";

const OPEN_STATUSES = ["spare_held", "checked_out"];

/** 監査ログを記録する（トランザクション内で呼ぶ） */
async function logAudit(
  tx: Prisma.TransactionClient,
  params: {
    usageRecordId: number | null;
    action: string;
    actorLabel: string;
    before?: unknown;
    after?: unknown;
    adminUserId?: number | null;
  },
) {
  await tx.auditLog.create({
    data: {
      usageRecordId: params.usageRecordId,
      adminUserId: params.adminUserId ?? null,
      action: params.action,
      actorLabel: params.actorLabel,
      before: params.before ? JSON.stringify(params.before) : null,
      after: params.after ? JSON.stringify(params.after) : null,
    },
  });
}

/** カードの未提出（オープン）レコードを取得する */
async function findOpenRecord(
  tx: Prisma.TransactionClient,
  cardId: number,
) {
  return tx.usageRecord.findFirst({
    where: { cardId, status: { in: OPEN_STATUSES } },
  });
}

async function cameramanName(
  tx: Prisma.TransactionClient,
  cameramanId: number,
): Promise<string> {
  const c = await tx.cameraman.findUnique({ where: { id: cameramanId } });
  return c?.name ?? `#${cameramanId}`;
}

// ── 持ち出し ───────────────────────────────────────────────
export async function checkout(input: {
  cameramanId: number;
  cardId: number;
  sceneId: number;
}) {
  return prisma.$transaction(async (tx) => {
    const open = await findOpenRecord(tx, input.cardId);
    if (open) {
      throw new AppError(
        "このカードは既に使用中です（提出されていません）。",
        409,
      );
    }
    const record = await tx.usageRecord.create({
      data: {
        cardId: input.cardId,
        cameramanId: input.cameramanId,
        sceneId: input.sceneId,
        kind: "checkout",
        status: "checked_out",
        checkedOutAt: new Date(),
      },
    });
    await logAudit(tx, {
      usageRecordId: record.id,
      action: "create",
      actorLabel: await cameramanName(tx, input.cameramanId),
      after: record,
    });
    return record;
  });
}

// ── 予備 ───────────────────────────────────────────────────
export async function spare(input: {
  cameramanId: number;
  cardId: number;
}) {
  return prisma.$transaction(async (tx) => {
    const open = await findOpenRecord(tx, input.cardId);
    if (open) {
      throw new AppError(
        "このカードは既に使用中です（提出されていません）。",
        409,
      );
    }
    const record = await tx.usageRecord.create({
      data: {
        cardId: input.cardId,
        cameramanId: input.cameramanId,
        kind: "spare",
        status: "spare_held",
        spareAt: new Date(),
      },
    });
    await logAudit(tx, {
      usageRecordId: record.id,
      action: "create",
      actorLabel: await cameramanName(tx, input.cameramanId),
      after: record,
    });
    return record;
  });
}

// ── 予備 → 持ち出し ────────────────────────────────────────
export async function spareToCheckout(input: {
  usageRecordId: number;
  sceneId: number;
}) {
  return prisma.$transaction(async (tx) => {
    const before = await tx.usageRecord.findUnique({
      where: { id: input.usageRecordId },
    });
    if (!before) throw new AppError("対象の記録が見つかりません。", 404);
    if (before.status !== "spare_held") {
      throw new AppError("予備保持中の記録ではありません。", 409);
    }
    const record = await tx.usageRecord.update({
      where: { id: input.usageRecordId },
      data: {
        status: "checked_out",
        checkedOutAt: new Date(),
        sceneId: input.sceneId,
      },
    });
    await logAudit(tx, {
      usageRecordId: record.id,
      action: "update",
      actorLabel: await cameramanName(tx, before.cameramanId),
      before,
      after: record,
    });
    return record;
  });
}

// ── 提出 ───────────────────────────────────────────────────
export async function submit(input: {
  usageRecordId: number;
  sceneId: number;
}) {
  return prisma.$transaction(async (tx) => {
    const before = await tx.usageRecord.findUnique({
      where: { id: input.usageRecordId },
    });
    if (!before) throw new AppError("対象の記録が見つかりません。", 404);
    if (before.status === "submitted") {
      throw new AppError("この記録は既に提出済みです。", 409);
    }
    const record = await tx.usageRecord.update({
      where: { id: input.usageRecordId },
      data: {
        status: "submitted",
        submittedAt: new Date(),
        sceneId: input.sceneId, // 実際に撮影したシーンで確定
      },
    });
    await logAudit(tx, {
      usageRecordId: record.id,
      action: "update",
      actorLabel: await cameramanName(tx, before.cameramanId),
      before,
      after: record,
    });
    return record;
  });
}

// ── カード候補の取得 ───────────────────────────────────────
export type CardCandidate = {
  cardId: number;
  label: string;
  note: string | null;
  // checkout モード用
  origin?: "available" | "spare";
  // spare/checkout からの転用・提出用
  usageRecordId?: number;
  status?: string;
  sceneName?: string | null;
};

export async function getCardCandidates(
  mode: "checkout" | "spare" | "submit",
  cameramanId: number,
): Promise<CardCandidate[]> {
  const cards = await prisma.card.findMany({
    where: { active: true },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
  });
  const openRecords = await prisma.usageRecord.findMany({
    where: { status: { in: OPEN_STATUSES } },
    include: { scene: true },
  });
  const openByCard = new Map(openRecords.map((r) => [r.cardId, r]));

  if (mode === "spare") {
    // 在庫（オープンレコードなし）のみ
    return cards
      .filter((c) => !openByCard.has(c.id))
      .map((c) => ({ cardId: c.id, label: c.label, note: c.note, origin: "available" as const }));
  }

  if (mode === "checkout") {
    const result: CardCandidate[] = [];
    for (const c of cards) {
      const open = openByCard.get(c.id);
      if (!open) {
        // 在庫から新規持ち出し
        result.push({ cardId: c.id, label: c.label, note: c.note, origin: "available" });
      } else if (open.status === "spare_held" && open.cameramanId === cameramanId) {
        // 自分の予備を持ち出しに転用
        result.push({
          cardId: c.id,
          label: c.label,
          note: c.note,
          origin: "spare",
          usageRecordId: open.id,
        });
      }
    }
    return result;
  }

  // submit: 自分が保持中（checked_out / spare_held）のカード
  const result: CardCandidate[] = [];
  for (const c of cards) {
    const open = openByCard.get(c.id);
    if (open && open.cameramanId === cameramanId) {
      result.push({
        cardId: c.id,
        label: c.label,
        note: c.note,
        usageRecordId: open.id,
        status: open.status,
        sceneName: open.scene?.name ?? null,
      });
    }
  }
  return result;
}
