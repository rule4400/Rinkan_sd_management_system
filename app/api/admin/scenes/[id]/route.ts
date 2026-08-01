import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { ok, handleError } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { sceneInputSchema } from "@/lib/validation";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    await requireAdmin();
    const { id } = await params;
    const input = sceneInputSchema.partial().parse(await req.json());
    const row = await prisma.scene.update({
      where: { id: Number(id) },
      data: input,
    });
    return ok(row);
  } catch (e) {
    return handleError(e);
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    await requireAdmin();
    const { id } = await params;
    const used = await prisma.usageRecord.count({
      where: { sceneId: Number(id) },
    });
    if (used > 0) {
      const row = await prisma.scene.update({
        where: { id: Number(id) },
        data: { active: false },
      });
      return ok({ ...row, softDeleted: true });
    }
    await prisma.scene.delete({ where: { id: Number(id) } });
    return ok({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}
