import { NextRequest, NextResponse } from "next/server";

// チーム共通パスゲート（TEAM_PASSPHRASE 設定時のみ作動）。
// Edge ランタイムで動くため Web Crypto を使用する。
const GATE_COOKIE = "sd_team_gate";

async function sha256hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function middleware(req: NextRequest) {
  const passphrase = process.env.TEAM_PASSPHRASE;
  // ゲート無効（LAN 運用の既定）→ そのまま通す
  if (!passphrase) return NextResponse.next();

  const { pathname } = req.nextUrl;
  // ゲート画面・ゲートAPI・静的アセットは除外
  if (
    pathname.startsWith("/gate") ||
    pathname.startsWith("/api/gate") ||
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico"
  ) {
    return NextResponse.next();
  }

  const expected = await sha256hex(
    `${passphrase}:${process.env.SESSION_SECRET || "insecure-dev-secret"}`,
  );
  const token = req.cookies.get(GATE_COOKIE)?.value;
  if (token === expected) return NextResponse.next();

  // 未通過：API は 401、画面はゲートへリダイレクト
  if (pathname.startsWith("/api")) {
    return NextResponse.json(
      { error: "チーム共通パスの入力が必要です" },
      { status: 401 },
    );
  }
  const url = req.nextUrl.clone();
  url.pathname = "/gate";
  url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  // 静的ファイルを除く全パスに適用
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
