import { ok, handleError } from "@/lib/api";
import { destroySession } from "@/lib/auth";

export async function POST() {
  try {
    await destroySession();
    return ok({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}
