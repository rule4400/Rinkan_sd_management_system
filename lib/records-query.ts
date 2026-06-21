import { Prisma } from "@prisma/client";

function parseIds(raw: string | null): number[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n > 0);
}

function parseDate(raw: string | null): Date | undefined {
  if (!raw) return undefined;
  const d = new Date(raw);
  return isNaN(d.getTime()) ? undefined : d;
}

/**
 * 検索パラメータから Prisma の where 句を組み立てる（設計書 §8.3）。
 * - 日時は範囲指定（持出/提出）
 * - カメラマン/カード/シーンは複数選択（IN）
 * - status は複数選択
 * - q はフリーワード（カードNo/シーン名/備考）
 */
export function buildRecordsWhere(
  sp: URLSearchParams,
): Prisma.UsageRecordWhereInput {
  const where: Prisma.UsageRecordWhereInput = {};
  const and: Prisma.UsageRecordWhereInput[] = [];

  // 日時範囲：持ち出し
  const coFrom = parseDate(sp.get("checkedOutFrom"));
  const coTo = parseDate(sp.get("checkedOutTo"));
  if (coFrom || coTo) {
    where.checkedOutAt = {
      ...(coFrom ? { gte: coFrom } : {}),
      ...(coTo ? { lte: coTo } : {}),
    };
  }

  // 日時範囲：提出
  const subFrom = parseDate(sp.get("submittedFrom"));
  const subTo = parseDate(sp.get("submittedTo"));
  if (subFrom || subTo) {
    where.submittedAt = {
      ...(subFrom ? { gte: subFrom } : {}),
      ...(subTo ? { lte: subTo } : {}),
    };
  }

  // 複数選択
  const cameramanIds = parseIds(sp.get("cameramanIds"));
  if (cameramanIds.length) where.cameramanId = { in: cameramanIds };

  const cardIds = parseIds(sp.get("cardIds"));
  if (cardIds.length) where.cardId = { in: cardIds };

  const sceneIds = parseIds(sp.get("sceneIds"));
  if (sceneIds.length) where.sceneId = { in: sceneIds };

  const status = (sp.get("status") || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (status.length) where.status = { in: status };

  // フリーワード（カードNo / シーン名 / 備考）
  const q = sp.get("q")?.trim();
  if (q) {
    and.push({
      OR: [
        { card: { label: { contains: q } } },
        { scene: { name: { contains: q } } },
        { note: { contains: q } },
      ],
    });
  }

  if (and.length) where.AND = and;
  return where;
}

export function parseSort(sp: URLSearchParams): Prisma.UsageRecordOrderByWithRelationInput {
  const raw = sp.get("sort") || "id:desc";
  const [field, dir] = raw.split(":");
  const direction = dir === "asc" ? "asc" : "desc";
  const allowed = ["id", "checkedOutAt", "submittedAt", "createdAt"];
  const key = allowed.includes(field) ? field : "id";
  return { [key]: direction };
}
