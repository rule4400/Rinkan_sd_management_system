import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { ok, handleError, AppError } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { masterImportSchema } from "@/lib/validation";
import { parseCsv, parseBool, parseIntOr } from "@/lib/csv";

// マスタ CSV インポート（テンプレートに記入したものを一括登録）
// 既存（カメラマン名 / カードNo / シーン名+コード）は重複としてスキップする
export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
    const { type, csv } = masterImportSchema.parse(await req.json());

    const rows = parseCsv(csv);
    if (rows.length < 2) {
      throw new AppError("ヘッダ行とデータ行が必要です。", 400);
    }
    const header = rows[0].map((h) => h.trim().toLowerCase());
    const col = (name: string) => header.indexOf(name);
    const dataRows = rows.slice(1);

    let created = 0;
    let skipped = 0;
    const errors: string[] = [];

    if (type === "cameramen") {
      const iName = col("name");
      if (iName < 0) throw new AppError("ヘッダに name 列が必要です。", 400);
      for (const [idx, r] of dataRows.entries()) {
        const name = (r[iName] ?? "").trim();
        if (!name) {
          skipped++;
          continue;
        }
        const exists = await prisma.cameraman.findFirst({ where: { name } });
        if (exists) {
          skipped++;
          continue;
        }
        try {
          await prisma.cameraman.create({
            data: {
              name,
              active: parseBool(r[col("active")]),
              sortOrder: parseIntOr(r[col("sortorder")]),
            },
          });
          created++;
        } catch {
          errors.push(`${idx + 2}行目: 登録に失敗`);
        }
      }
    } else if (type === "cards") {
      const iLabel = col("label");
      if (iLabel < 0) throw new AppError("ヘッダに label 列が必要です。", 400);
      for (const [idx, r] of dataRows.entries()) {
        const label = (r[iLabel] ?? "").trim();
        if (!label) {
          skipped++;
          continue;
        }
        const exists = await prisma.card.findUnique({ where: { label } });
        if (exists) {
          skipped++;
          continue;
        }
        try {
          const note = (r[col("note")] ?? "").trim();
          await prisma.card.create({
            data: {
              label,
              note: note || null,
              active: parseBool(r[col("active")]),
              sortOrder: parseIntOr(r[col("sortorder")]),
            },
          });
          created++;
        } catch {
          errors.push(`${idx + 2}行目: 登録に失敗`);
        }
      }
    } else {
      // scenes
      const iName = col("name");
      if (iName < 0) throw new AppError("ヘッダに name 列が必要です。", 400);
      for (const [idx, r] of dataRows.entries()) {
        const name = (r[iName] ?? "").trim();
        if (!name) {
          skipped++;
          continue;
        }
        const code = (r[col("code")] ?? "").trim() || null;
        const exists = await prisma.scene.findFirst({ where: { name, code } });
        if (exists) {
          skipped++;
          continue;
        }
        try {
          await prisma.scene.create({
            data: {
              name,
              code,
              active: parseBool(r[col("active")]),
              sortOrder: parseIntOr(r[col("sortorder")]),
            },
          });
          created++;
        } catch {
          errors.push(`${idx + 2}行目: 登録に失敗`);
        }
      }
    }

    return ok({ created, skipped, errors });
  } catch (e) {
    return handleError(e);
  }
}
