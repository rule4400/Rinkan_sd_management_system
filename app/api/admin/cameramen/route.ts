import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { ok, handleError } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { cameramanInputSchema } from "@/lib/validation";

export async function GET() {
  try {
    await requireAdmin();
    const rows = await prisma.cameraman.findMany({
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
    const input = cameramanInputSchema.parse(await req.json());
    const row = await prisma.cameraman.create({ data: input });
    return ok(row, { status: 201 });
  } catch (e) {
    return handleError(e);
  }
}
