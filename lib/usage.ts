import { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { AppError } from "./api";

// カードが「誰かに保持されている／使用中」とみなす状態。
// これらの状態のカードは他者が新規に使えない。仮提出(provisional)も保持中扱い。
const OPEN_STATUSES = ["spare_held", "checked_out", "provisional"];

type SnapshotInput = {
  usageRecordId: number | null;
  action: string;
  actorLabel: string;
  before?: unknown;
  after?: unknown;
  adminUserId?: number | null;
};

/** 監査ログを記録する（トランザクション内で呼ぶ） */
async function logAudit(tx: Prisma.TransactionClient, params: SnapshotInput) {
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

/** 記録のスナップショット（監査・やり直し用）。シーン一覧も含める。 */
async function snapshot(tx: Prisma.TransactionClient, recordId: number) {
  const record = await tx.usageRecord.findUnique({
    where: { id: recordId },
    include: { recordScenes: true },
  });
  if (!record) return null;
  const { recordScenes, ...rest } = record;
  return { ...rest, sceneIds: recordScenes.map((rs) => rs.sceneId) };
}

/** カードの未提出（オープン）レコードを取得する */
async function findOpenRecord(tx: Prisma.TransactionClient, cardId: number) {
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

/** 紐づくシーンを丸ごと置き換える（代表シーン sceneId も先頭で更新） */
async function replaceScenes(
  tx: Prisma.TransactionClient,
  recordId: number,
  sceneIds: number[],
) {
  const unique = [...new Set(sceneIds)];
  await tx.recordScene.deleteMany({ where: { usageRecordId: recordId } });
  if (unique.length) {
    await tx.recordScene.createMany({
      data: unique.map((sceneId) => ({ usageRecordId: recordId, sceneId })),
    });
  }
  await tx.usageRecord.update({
    where: { id: recordId },
    data: { sceneId: unique[0] ?? null },
  });
}

/** シーンIDの妥当性チェック（1つ以上・存在するシーンか） */
async function assertScenesExist(
  tx: Prisma.TransactionClient,
  sceneIds: number[],
) {
  const unique = [...new Set(sceneIds)];
  if (unique.length === 0) {
    throw new AppError("シーンを1つ以上選択してください。", 400);
  }
  const count = await tx.scene.count({ where: { id: { in: unique } } });
  if (count !== unique.length) {
    throw new AppError("選択されたシーンに無効なものが含まれています。", 400);
  }
}

// ── 持ち出し ───────────────────────────────────────────────
export async function checkout(input: {
  cameramanId: number;
  cardId: number;
  sceneIds: number[];
}) {
  return prisma.$transaction(async (tx) => {
    await assertScenesExist(tx, input.sceneIds);
    const open = await findOpenRecord(tx, input.cardId);
    if (open) {
      throw new AppError("このカードは既に使用中です（提出されていません）。", 409);
    }
    const record = await tx.usageRecord.create({
      data: {
        cardId: input.cardId,
        cameramanId: input.cameramanId,
        sceneId: input.sceneIds[0],
        kind: "checkout",
        status: "checked_out",
        checkedOutAt: new Date(),
      },
    });
    await replaceScenes(tx, record.id, input.sceneIds);
    await logAudit(tx, {
      usageRecordId: record.id,
      action: "create",
      actorLabel: await cameramanName(tx, input.cameramanId),
      after: await snapshot(tx, record.id),
    });
    return record;
  });
}

// ── 予備 ───────────────────────────────────────────────────
export async function spare(input: { cameramanId: number; cardId: number }) {
  return prisma.$transaction(async (tx) => {
    const open = await findOpenRecord(tx, input.cardId);
    if (open) {
      throw new AppError("このカードは既に使用中です（提出されていません）。", 409);
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
      after: await snapshot(tx, record.id),
    });
    return record;
  });
}

// ── 予備 → 持ち出し ────────────────────────────────────────
export async function spareToCheckout(input: {
  usageRecordId: number;
  sceneIds: number[];
}) {
  return prisma.$transaction(async (tx) => {
    await assertScenesExist(tx, input.sceneIds);
    const before = await snapshot(tx, input.usageRecordId);
    if (!before) throw new AppError("対象の記録が見つかりません。", 404);
    if (before.status !== "spare_held") {
      throw new AppError("予備保持中の記録ではありません。", 409);
    }
    await tx.usageRecord.update({
      where: { id: input.usageRecordId },
      data: { status: "checked_out", checkedOutAt: new Date() },
    });
    await replaceScenes(tx, input.usageRecordId, input.sceneIds);
    const record = await tx.usageRecord.findUnique({
      where: { id: input.usageRecordId },
    });
    await logAudit(tx, {
      usageRecordId: input.usageRecordId,
      action: "update",
      actorLabel: await cameramanName(tx, before.cameramanId),
      before,
      after: await snapshot(tx, input.usageRecordId),
    });
    return record!;
  });
}

// ── 仮提出（撮影完了・カードはカメラマンが保持中）───────────
export async function provisional(input: {
  usageRecordId: number;
  sceneIds: number[];
}) {
  return prisma.$transaction(async (tx) => {
    await assertScenesExist(tx, input.sceneIds);
    const before = await snapshot(tx, input.usageRecordId);
    if (!before) throw new AppError("対象の記録が見つかりません。", 404);
    if (before.status === "submitted") {
      throw new AppError("この記録は既に提出済みです。", 409);
    }
    await tx.usageRecord.update({
      where: { id: input.usageRecordId },
      data: { status: "provisional", provisionalAt: new Date() },
    });
    await replaceScenes(tx, input.usageRecordId, input.sceneIds);
    const record = await tx.usageRecord.findUnique({
      where: { id: input.usageRecordId },
    });
    await logAudit(tx, {
      usageRecordId: input.usageRecordId,
      action: "update",
      actorLabel: await cameramanName(tx, before.cameramanId),
      before,
      after: await snapshot(tx, input.usageRecordId),
    });
    return record!;
  });
}

// ── 提出（仮提出・持ち出し・予備のいずれからも正式提出に確定）─
export async function submit(input: {
  usageRecordId: number;
  sceneIds: number[];
}) {
  return prisma.$transaction(async (tx) => {
    await assertScenesExist(tx, input.sceneIds);
    const before = await snapshot(tx, input.usageRecordId);
    if (!before) throw new AppError("対象の記録が見つかりません。", 404);
    if (before.status === "submitted") {
      throw new AppError("この記録は既に提出済みです。", 409);
    }
    await tx.usageRecord.update({
      where: { id: input.usageRecordId },
      data: { status: "submitted", submittedAt: new Date() },
    });
    await replaceScenes(tx, input.usageRecordId, input.sceneIds);
    const record = await tx.usageRecord.findUnique({
      where: { id: input.usageRecordId },
    });
    await logAudit(tx, {
      usageRecordId: input.usageRecordId,
      action: "update",
      actorLabel: await cameramanName(tx, before.cameramanId),
      before,
      after: await snapshot(tx, input.usageRecordId),
    });
    return record!;
  });
}

function toDate(v: unknown): Date | null {
  if (!v) return null;
  const d = new Date(v as string);
  return isNaN(d.getTime()) ? null : d;
}

// ── やり直し（直前操作の取り消し）──────────────────────────
// 監査ログの最新エントリを元に、直前の操作を取り消す。
//  - 作成(create)の取り消し → レコードを削除
//  - 更新(update/correct)の取り消し → before スナップショットへ復元
export async function undoRecord(input: {
  usageRecordId: number;
  actorLabel?: string;
}) {
  return prisma.$transaction(async (tx) => {
    const current = await snapshot(tx, input.usageRecordId);
    if (!current) throw new AppError("対象の記録が見つかりません。", 404);

    const latest = await tx.auditLog.findFirst({
      where: { usageRecordId: input.usageRecordId },
      orderBy: { id: "desc" },
    });
    if (!latest) throw new AppError("取り消せる操作の履歴がありません。", 409);
    if (latest.action === "undo") {
      throw new AppError("この記録は既に取り消し済みです。", 409);
    }

    const actorLabel =
      input.actorLabel ?? (await cameramanName(tx, current.cameramanId));

    // before が無い＝作成操作 → レコードごと削除
    if (!latest.before) {
      await tx.auditLog.updateMany({
        where: { usageRecordId: input.usageRecordId },
        data: { usageRecordId: null },
      });
      await tx.usageRecord.delete({ where: { id: input.usageRecordId } });
      await logAudit(tx, {
        usageRecordId: null,
        action: "undo",
        actorLabel,
        before: current,
      });
      return { deleted: true as const };
    }

    // before へ復元
    const before = JSON.parse(latest.before) as Record<string, unknown>;
    await tx.usageRecord.update({
      where: { id: input.usageRecordId },
      data: {
        cardId: before.cardId as number,
        cameramanId: before.cameramanId as number,
        kind: before.kind as string,
        status: before.status as string,
        checkedOutAt: toDate(before.checkedOutAt),
        spareAt: toDate(before.spareAt),
        provisionalAt: toDate(before.provisionalAt),
        submittedAt: toDate(before.submittedAt),
        note: (before.note as string | null) ?? null,
      },
    });
    await replaceScenes(
      tx,
      input.usageRecordId,
      Array.isArray(before.sceneIds) ? (before.sceneIds as number[]) : [],
    );
    const restored = await snapshot(tx, input.usageRecordId);
    await logAudit(tx, {
      usageRecordId: input.usageRecordId,
      action: "undo",
      actorLabel,
      before: current,
      after: restored,
    });
    return { deleted: false as const, record: restored };
  });
}

// ── カード候補の取得 ───────────────────────────────────────
export type CardCandidate = {
  cardId: number;
  label: string;
  note: string | null;
  // checkout モード用
  origin?: "available" | "spare";
  // spare/checkout からの転用・提出・仮提出用
  usageRecordId?: number;
  status?: string;
  sceneNames?: string[];
};

export async function getCardCandidates(
  mode: "checkout" | "spare" | "submit" | "provisional",
  cameramanId: number,
): Promise<CardCandidate[]> {
  const cards = await prisma.card.findMany({
    where: { active: true },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
  });
  const openRecords = await prisma.usageRecord.findMany({
    where: { status: { in: OPEN_STATUSES } },
    include: { recordScenes: { include: { scene: true } } },
  });
  const openByCard = new Map(openRecords.map((r) => [r.cardId, r]));
  const sceneNamesOf = (r: (typeof openRecords)[number]) =>
    r.recordScenes.map((rs) => rs.scene.name);

  if (mode === "spare") {
    // 在庫（オープンレコードなし）のみ
    return cards
      .filter((c) => !openByCard.has(c.id))
      .map((c) => ({
        cardId: c.id,
        label: c.label,
        note: c.note,
        origin: "available" as const,
      }));
  }

  if (mode === "checkout") {
    const result: CardCandidate[] = [];
    for (const c of cards) {
      const open = openByCard.get(c.id);
      if (!open) {
        result.push({ cardId: c.id, label: c.label, note: c.note, origin: "available" });
      } else if (open.status === "spare_held" && open.cameramanId === cameramanId) {
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

  if (mode === "provisional") {
    // 自分が保持中で、まだ仮提出/提出していないカード（持ち出し中・予備保持中）
    const result: CardCandidate[] = [];
    for (const c of cards) {
      const open = openByCard.get(c.id);
      if (
        open &&
        open.cameramanId === cameramanId &&
        (open.status === "checked_out" || open.status === "spare_held")
      ) {
        result.push({
          cardId: c.id,
          label: c.label,
          note: c.note,
          usageRecordId: open.id,
          status: open.status,
          sceneNames: sceneNamesOf(open),
        });
      }
    }
    return result;
  }

  // submit: 自分が保持中（持ち出し中・予備保持中・仮提出）のカード
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
        sceneNames: sceneNamesOf(open),
      });
    }
  }
  return result;
}
