import { NextRequest } from "next/server";
import { ok, handleError } from "@/lib/api";
import { spareSchema } from "@/lib/validation";
import { spare } from "@/lib/usage";

export async function POST(req: NextRequest) {
  try {
    const input = spareSchema.parse(await req.json());
    const record = await spare(input);
    return ok({ id: record.id }, { status: 201 });
  } catch (e) {
    return handleError(e);
  }
}
