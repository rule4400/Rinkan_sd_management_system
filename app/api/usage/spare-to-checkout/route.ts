import { NextRequest } from "next/server";
import { ok, handleError } from "@/lib/api";
import { spareToCheckoutSchema } from "@/lib/validation";
import { spareToCheckout } from "@/lib/usage";

export async function POST(req: NextRequest) {
  try {
    const input = spareToCheckoutSchema.parse(await req.json());
    const record = await spareToCheckout(input);
    return ok({ id: record.id }, { status: 200 });
  } catch (e) {
    return handleError(e);
  }
}
