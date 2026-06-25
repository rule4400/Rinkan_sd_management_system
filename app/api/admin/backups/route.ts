import { ok, handleError } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { createBackup, listBackups } from "@/lib/backup";

// バックアップ一覧
export async function GET() {
  try {
    await requireAdmin();
    return ok({ backups: listBackups() });
  } catch (e) {
    return handleError(e);
  }
}

// 今すぐバックアップを作成
export async function POST() {
  try {
    await requireAdmin();
    const info = await createBackup("manual");
    return ok({ created: info }, { status: 201 });
  } catch (e) {
    return handleError(e);
  }
}
