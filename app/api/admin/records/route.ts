import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { ok, handleError } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { buildRecordsWhere, parseSort } from "@/lib/records-query";

export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
    const sp = req.nextUrl.searchParams;
    const where = buildRecordsWhere(sp);
    const orderBy = parseSort(sp);

    const page = Math.max(1, Number(sp.get("page")) || 1);
    const pageSize = Math.min(200, Math.max(1, Number(sp.get("pageSize")) || 50));

    const [total, rows] = await Promise.all([
      prisma.usageRecord.count({ where }),
      prisma.usageRecord.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          card: { select: { id: true, label: true } },
          cameraman: { select: { id: true, name: true } },
          scene: { select: { id: true, name: true } },
        },
      }),
    ]);

    return ok({ total, page, pageSize, rows });
  } catch (e) {
    return handleError(e);
  }
}
