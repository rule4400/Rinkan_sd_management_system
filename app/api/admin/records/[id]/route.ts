import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { ok, handleError, AppError } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { recordUpdateSchema } from "@/lib/validation";

type Params = { params: Promise<{ id: string }> };

// 記録の修正（誤操作の訂正）。変更は監査ログに自動記録。
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const admin = await requireAdmin();
    const { id } = await params;
    const recordId = Number(id);
    const input = recordUpdateSchema.parse(await req.json());

    const result = await prisma.$transaction(async (tx) => {
      const before = await tx.usageRecord.findUnique({
        where: { id: recordId },
      });
      if (!before) throw new AppError("対象の記録が見つかりません。", 404);

      const data: Record<string, unknown> = {};
      if (input.cardId !== undefined) data.cardId = input.cardId;
      if (input.cameramanId !== undefined) data.cameramanId = input.cameramanId;
      if (input.sceneId !== undefined) data.sceneId = input.sceneId;
      if (input.kind !== undefined) data.kind = input.kind;
      if (input.status !== undefined) data.status = input.status;
      if (input.checkedOutAt !== undefined)
        data.checkedOutAt = input.checkedOutAt ? new Date(input.checkedOutAt) : null;
      if (input.spareAt !== undefined)
        data.spareAt = input.spareAt ? new Date(input.spareAt) : null;
      if (input.submittedAt !== undefined)
        data.submittedAt = input.submittedAt ? new Date(input.submittedAt) : null;
      if (input.note !== undefined) data.note = input.note;

      const updated = await tx.usageRecord.update({
        where: { id: recordId },
        data,
      });

      await tx.auditLog.create({
        data: {
          usageRecordId: recordId,
          adminUserId: admin.id,
          action: "correct",
          actorLabel: `管理者:${admin.username}`,
          before: JSON.stringify(before),
          after: JSON.stringify(updated),
        },
      });
      return updated;
    });

    return ok(result);
  } catch (e) {
    return handleError(e);
  }
}

// 記録の削除（監査ログを残す）
export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const admin = await requireAdmin();
    const { id } = await params;
    const recordId = Number(id);

    await prisma.$transaction(async (tx) => {
      const before = await tx.usageRecord.findUnique({
        where: { id: recordId },
      });
      if (!before) throw new AppError("対象の記録が見つかりません。", 404);

      // 監査ログの参照を外してから削除（履歴は actorLabel 等で追跡可能）
      await tx.auditLog.updateMany({
        where: { usageRecordId: recordId },
        data: { usageRecordId: null },
      });
      await tx.usageRecord.delete({ where: { id: recordId } });
      await tx.auditLog.create({
        data: {
          usageRecordId: null,
          adminUserId: admin.id,
          action: "delete",
          actorLabel: `管理者:${admin.username}`,
          before: JSON.stringify(before),
        },
      });
    });

    return ok({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}
