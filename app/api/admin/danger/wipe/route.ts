import { NextRequest } from "next/server";
import { ok, handleError, AppError } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { dangerWipeSchema } from "@/lib/validation";
import { wipeData } from "@/lib/backup";

// 全データ削除（実行前に自動バックアップを取得）。確認フレーズ必須。
const CONFIRM_PHRASE: Record<"transactions" | "all", string> = {
  transactions: "利用記録を全て削除",
  all: "全データを初期化",
};

export async function POST(req: NextRequest) {
  try {
    const admin = await requireAdmin();
    const { scope, confirm } = dangerWipeSchema.parse(await req.json());
    if (confirm.trim() !== CONFIRM_PHRASE[scope]) {
      throw new AppError(
        `確認フレーズが一致しません。「${CONFIRM_PHRASE[scope]}」と入力してください。`,
        400,
      );
    }
    await wipeData(scope);
    return ok({ ok: true, scope, by: admin.username });
  } catch (e) {
    return handleError(e);
  }
}
