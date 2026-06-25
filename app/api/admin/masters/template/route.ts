import { NextRequest } from "next/server";
import { handleError, AppError } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { buildTemplate, MasterType } from "@/lib/csv";

// マスタ登録用 CSV テンプレートをダウンロードする
// /api/admin/masters/template?type=cameramen|cards|scenes
export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
    const type = req.nextUrl.searchParams.get("type") as MasterType | null;
    if (type !== "cameramen" && type !== "cards" && type !== "scenes") {
      throw new AppError("type が不正です。", 400);
    }
    const body = buildTemplate(type);
    return new Response(body, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="template_${type}.csv"`,
      },
    });
  } catch (e) {
    return handleError(e);
  }
}
