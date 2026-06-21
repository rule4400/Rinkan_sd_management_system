import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { ok, handleError, AppError } from "@/lib/api";
import { gateSchema } from "@/lib/validation";
import { GATE_COOKIE, isGateEnabled, expectedGateToken } from "@/lib/gate";

export async function POST(req: NextRequest) {
  try {
    if (!isGateEnabled()) {
      // ゲート無効時は常に通過扱い
      return ok({ ok: true, disabled: true });
    }
    const { passphrase } = gateSchema.parse(await req.json());
    if (passphrase !== process.env.TEAM_PASSPHRASE) {
      throw new AppError("チーム共通パスが違います。", 401);
    }
    const cookieStore = await cookies();
    cookieStore.set(GATE_COOKIE, expectedGateToken(), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 30, // 30日
    });
    return ok({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}
