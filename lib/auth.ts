import crypto from "crypto";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { prisma } from "./db";

const COOKIE_NAME = "sd_admin_session";
const SESSION_TTL_SEC = 60 * 60 * 8; // 8時間

function getSecret(): string {
  return process.env.SESSION_SECRET || "insecure-dev-secret";
}

/**
 * 署名付きセッショントークンを生成する。
 * 形式: base64url(payload).hexHmac
 */
function sign(payload: object): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto
    .createHmac("sha256", getSecret())
    .update(body)
    .digest("hex");
  return `${body}.${sig}`;
}

function verify(token: string): { adminId: number; exp: number } | null {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = crypto
    .createHmac("sha256", getSecret())
    .update(body)
    .digest("hex");
  // タイミング攻撃対策の固定長比較
  if (
    sig.length !== expected.length ||
    !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
  ) {
    return null;
  }
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString());
    if (typeof payload.exp !== "number" || payload.exp < Date.now() / 1000) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export async function verifyPassword(
  plain: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

/** ログイン成功時にセッション Cookie を発行する */
export async function createSession(adminId: number): Promise<void> {
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_SEC;
  const token = sign({ adminId, exp });
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SEC,
  });
}

export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

/** 現在のリクエストの管理者を返す（未ログインなら null） */
export async function getCurrentAdmin() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  const payload = verify(token);
  if (!payload) return null;
  const admin = await prisma.adminUser.findUnique({
    where: { id: payload.adminId },
    select: { id: true, username: true },
  });
  return admin;
}

/** API ルートで管理者必須を保証する。未認証なら例外を投げる。 */
export async function requireAdmin() {
  const admin = await getCurrentAdmin();
  if (!admin) {
    throw new UnauthorizedError();
  }
  return admin;
}

export class UnauthorizedError extends Error {
  constructor() {
    super("Unauthorized");
    this.name = "UnauthorizedError";
  }
}
