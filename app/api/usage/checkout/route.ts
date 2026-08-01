import { NextRequest } from "next/server";
import { ok, handleError } from "@/lib/api";
import { checkoutSchema } from "@/lib/validation";
import { checkout } from "@/lib/usage";

export async function POST(req: NextRequest) {
  try {
    const input = checkoutSchema.parse(await req.json());
    const record = await checkout(input);
    return ok({ id: record.id }, { status: 201 });
  } catch (e) {
    return handleError(e);
  }
}
