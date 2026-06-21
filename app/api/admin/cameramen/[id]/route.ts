import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { ok, handleError } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { cameramanInputSchema } from "@/lib/validation";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    await requireAdmin();
    const { id } = await params;
    const input = cameramanInputSchema.partial().parse(await req.json());
    const row = await prisma.cameraman.update({
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
    // 履歴を持つ場合は無効化（active=false）で論理削除、なければ物理削除
    const used = await prisma.usageRecord.count({
      where: { cameramanId: Number(id) },
    });
    if (used > 0) {
      const row = await prisma.cameraman.update({
        where: { id: Number(id) },
        data: { active: false },
      });
      return ok({ ...row, softDeleted: true });
    }
    await prisma.cameraman.delete({ where: { id: Number(id) } });
    return ok({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}
