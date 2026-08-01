import { NextRequest } from "next/server";
import { ok, handleError } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { backupRestoreSchema } from "@/lib/validation";
import { restoreBackup } from "@/lib/backup";

// 指定した日時のバックアップへロールバック（復元前に現状を自動退避）
export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
    const { name } = backupRestoreSchema.parse(await req.json());
    const result = await restoreBackup(name);
    return ok(result);
  } catch (e) {
    return handleError(e);
  }
}
