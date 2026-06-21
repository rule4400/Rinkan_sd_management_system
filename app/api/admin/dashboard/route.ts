import { prisma } from "@/lib/db";
import { ok, handleError } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";

export async function GET() {
  try {
    await requireAdmin();

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const [checkedOut, spareHeld, submittedToday, totalRecords] =
      await Promise.all([
        prisma.usageRecord.count({ where: { status: "checked_out" } }),
        prisma.usageRecord.count({ where: { status: "spare_held" } }),
        prisma.usageRecord.count({
          where: { submittedAt: { gte: startOfToday } },
        }),
        prisma.usageRecord.count(),
      ]);

    // 未提出のまま長時間経過しているレコード（紛失検知用）
    const staleThreshold = new Date(Date.now() - 12 * 60 * 60 * 1000);
    const staleCheckedOut = await prisma.usageRecord.count({
      where: { status: "checked_out", checkedOutAt: { lt: staleThreshold } },
    });

    return ok({
      checkedOut,
      spareHeld,
      submittedToday,
      totalRecords,
      staleCheckedOut,
    });
  } catch (e) {
    return handleError(e);
  }
}
