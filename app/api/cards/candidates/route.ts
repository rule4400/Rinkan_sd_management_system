import { NextRequest } from "next/server";
import { ok, handleError, AppError } from "@/lib/api";
import { getCardCandidates } from "@/lib/usage";

// 操作種別に応じたカード候補を返す
// /api/cards/candidates?mode=checkout|spare|submit&cameramanId=1
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const mode = sp.get("mode");
    const cameramanId = Number(sp.get("cameramanId"));
    if (mode !== "checkout" && mode !== "spare" && mode !== "submit") {
      throw new AppError("mode が不正です。", 400);
    }
    if (!cameramanId) {
      throw new AppError("cameramanId が必要です。", 400);
    }
    const candidates = await getCardCandidates(mode, cameramanId);
    return ok(candidates);
  } catch (e) {
    return handleError(e);
  }
}
