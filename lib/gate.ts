import crypto from "crypto";

// チーム共通パスのゲート（インターネット公開時のアプリ層保護）
// TEAM_PASSPHRASE が設定されている場合のみ有効化される。
export const GATE_COOKIE = "sd_team_gate";

export function isGateEnabled(): boolean {
  return !!process.env.TEAM_PASSPHRASE;
}

/** 正解パスから決まる固定トークン（Cookie に格納する値） */
export function expectedGateToken(): string {
  const secret = process.env.SESSION_SECRET || "insecure-dev-secret";
  return crypto
    .createHash("sha256")
    .update(`${process.env.TEAM_PASSPHRASE}:${secret}`)
    .digest("hex");
}
