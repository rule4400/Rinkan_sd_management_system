import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { ok, handleError } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { cardInputSchema } from "@/lib/validation";

export async function GET() {
  try {
    await requireAdmin();
    const rows = await prisma.card.findMany({
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    });
    return ok(rows);
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
    const input = cardInputSchema.parse(await req.json());
    const row = await prisma.card.create({ data: input });
    return ok(row, { status: 201 });
  } catch (e) {
    return handleError(e);
  }
}
