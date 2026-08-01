import { headers } from "next/headers";

/**
 * Cookie の `Secure` 属性を決定する。
 *
 * 背景: 本アプリは LAN 内では HTTP（非HTTPS）で配信される（Electron 内蔵サーバー / Raspberry Pi 等）。
 * `Secure` を付けるとブラウザは HTTP では Cookie を送り返さないため、管理ログインやチームゲートが
 * 「ログインは通るのに以降は未認証」という壊れ方をする。一方インターネット公開時（Cloudflare Tunnel /
 * リバースプロキシ経由）は実質 HTTPS なので `Secure` を付けたい。
 *
 * 判定:
 *  1. 環境変数 `COOKIE_SECURE` が `true`/`false` なら最優先で従う（運用での明示制御用）。
 *  2. それ以外はリクエストの `x-forwarded-proto` が `https` のときだけ `Secure` を付ける。
 *     逆プロキシが無い LAN 直アクセスでは付けない。
 */
export async function getCookieSecure(): Promise<boolean> {
  const override = process.env.COOKIE_SECURE?.toLowerCase();
  if (override === "true") return true;
  if (override === "false") return false;

  const h = await headers();
  const proto = (h.get("x-forwarded-proto") || "")
    .split(",")[0]
    .trim()
    .toLowerCase();
  return proto === "https";
}
