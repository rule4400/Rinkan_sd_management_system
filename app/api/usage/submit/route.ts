import { NextRequest } from "next/server";
import { ok, handleError } from "@/lib/api";
import { submitSchema } from "@/lib/validation";
import { submit } from "@/lib/usage";

export async function POST(req: NextRequest) {
  try {
    const input = submitSchema.parse(await req.json());
    const record = await submit(input);
    return ok({ id: record.id }, { status: 200 });
  } catch (e) {
    return handleError(e);
  }
}
