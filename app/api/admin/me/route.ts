import { ok, handleError } from "@/lib/api";
import { getCurrentAdmin } from "@/lib/auth";

export async function GET() {
  try {
    const admin = await getCurrentAdmin();
    return ok({ admin });
  } catch (e) {
    return handleError(e);
  }
}
