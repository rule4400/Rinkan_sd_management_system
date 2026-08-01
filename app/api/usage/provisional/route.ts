import { NextRequest } from "next/server";
import { ok, handleError } from "@/lib/api";
import { provisionalSchema } from "@/lib/validation";
import { provisional } from "@/lib/usage";

// 仮提出：撮影は完了したがカードはカメラマンが保持中
export async function POST(req: NextRequest) {
  try {
    const input = provisionalSchema.parse(await req.json());
    const record = await provisional(input);
    return ok({ id: record.id }, { status: 200 });
  } catch (e) {
    return handleError(e);
  }
}
