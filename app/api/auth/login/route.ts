import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { ok, handleError, AppError } from "@/lib/api";
import { loginSchema } from "@/lib/validation";
import { verifyPassword, createSession } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const { username, password } = loginSchema.parse(await req.json());
    const admin = await prisma.adminUser.findUnique({ where: { username } });
    if (!admin || !(await verifyPassword(password, admin.passwordHash))) {
      throw new AppError("ユーザー名またはパスワードが違います。", 401);
    }
    await createSession(admin.id);
    return ok({ username: admin.username });
  } catch (e) {
    return handleError(e);
  }
}
