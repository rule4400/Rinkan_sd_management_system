import { prisma } from "@/lib/db";
import { ok, handleError } from "@/lib/api";

// 利用者ログイン用：有効なカメラマン一覧
export async function GET() {
  try {
    const cameramen = await prisma.cameraman.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      select: { id: true, name: true },
    });
    return ok(cameramen);
  } catch (e) {
    return handleError(e);
  }
}
