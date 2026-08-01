import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { ok, handleError } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { cardInputSchema } from "@/lib/validation";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    await requireAdmin();
    const { id } = await params;
    const input = cardInputSchema.partial().parse(await req.json());
    const row = await prisma.card.update({
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
      where: { cardId: Number(id) },
    });
    if (used > 0) {
      const row = await prisma.card.update({
        where: { id: Number(id) },
        data: { active: false },
      });
      return ok({ ...row, softDeleted: true });
    }
    await prisma.card.delete({ where: { id: Number(id) } });
    return ok({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}
