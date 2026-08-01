import { prisma } from "@/lib/db";
import { ok, handleError } from "@/lib/api";

// シーン選択用：有効なシーン一覧
export async function GET() {
  try {
    const scenes = await prisma.scene.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      select: { id: true, name: true, code: true },
    });
    return ok(scenes);
  } catch (e) {
    return handleError(e);
  }
}
