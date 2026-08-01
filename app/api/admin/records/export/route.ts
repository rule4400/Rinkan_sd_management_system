import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { handleError } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { buildRecordsWhere, parseSort } from "@/lib/records-query";

const STATUS_LABEL: Record<string, string> = {
  spare_held: "予備保持中",
  checked_out: "持ち出し中",
  provisional: "仮提出",
  submitted: "提出済み",
};

function csvCell(v: unknown): string {
  const s = v == null ? "" : String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function fmt(d: Date | null): string {
  if (!d) return "";
  return new Date(d).toLocaleString("ja-JP");
}

// 検索条件を反映した CSV エクスポート（追跡資料用）
export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
    const sp = req.nextUrl.searchParams;
    const where = buildRecordsWhere(sp);
    const orderBy = parseSort(sp);

    const rows = await prisma.usageRecord.findMany({
      where,
      orderBy,
      include: {
        card: { select: { label: true } },
        cameraman: { select: { name: true } },
        recordScenes: { include: { scene: { select: { name: true } } } },
      },
    });

    const header = [
      "No",
      "状態",
      "持ち出し日時",
      "仮提出日時",
      "提出日時",
      "カメラマン",
      "カードNo",
      "シーン",
      "備考",
    ];
    const lines = [header.map(csvCell).join(",")];
    for (const r of rows) {
      lines.push(
        [
          r.id,
          STATUS_LABEL[r.status] ?? r.status,
          fmt(r.checkedOutAt),
          fmt(r.provisionalAt),
          fmt(r.submittedAt),
          r.cameraman.name,
          r.card.label,
          r.recordScenes.map((rs) => rs.scene.name).join(" / "),
          r.note ?? "",
        ]
          .map(csvCell)
          .join(","),
      );
    }
    // Excel で文字化けしないよう BOM を付与
    const body = "﻿" + lines.join("\r\n");

    return new Response(body, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="sd_records_${Date.now()}.csv"`,
      },
    });
  } catch (e) {
    return handleError(e);
  }
}
