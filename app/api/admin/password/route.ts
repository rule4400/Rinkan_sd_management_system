import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { ok, handleError, AppError } from "@/lib/api";
import { requireAdmin, verifyPassword, hashPassword } from "@/lib/auth";
import { passwordChangeSchema } from "@/lib/validation";

// 管理者パスワードの変更
export async function PATCH(req: NextRequest) {
  try {
    const me = await requireAdmin();
    const { currentPassword, newPassword } = passwordChangeSchema.parse(
      await req.json(),
    );

    const admin = await prisma.adminUser.findUnique({ where: { id: me.id } });
    if (!admin || !(await verifyPassword(currentPassword, admin.passwordHash))) {
      throw new AppError("現在のパスワードが違います。", 400);
    }
    if (currentPassword === newPassword) {
      throw new AppError("現在と異なるパスワードを設定してください。", 400);
    }

    await prisma.adminUser.update({
      where: { id: me.id },
      data: { passwordHash: await hashPassword(newPassword) },
    });
    return ok({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}
