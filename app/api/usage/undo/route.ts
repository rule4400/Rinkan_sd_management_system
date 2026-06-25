import { NextRequest } from "next/server";
import { ok, handleError } from "@/lib/api";
import { undoSchema } from "@/lib/validation";
import { undoRecord } from "@/lib/usage";

// やり直し：直前の操作を取り消す（誤登録・誤操作の救済）
export async function POST(req: NextRequest) {
  try {
    const input = undoSchema.parse(await req.json());
    const result = await undoRecord(input);
    return ok(result);
  } catch (e) {
    return handleError(e);
  }
}
