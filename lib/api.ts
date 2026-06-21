import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { UnauthorizedError } from "./auth";

/** 成功レスポンス */
export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

/** 例外を HTTP レスポンスへ変換する共通ハンドラ */
export function handleError(err: unknown) {
  if (err instanceof ZodError) {
    return NextResponse.json(
      { error: "入力内容が不正です", details: err.flatten() },
      { status: 400 },
    );
  }
  if (err instanceof UnauthorizedError) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }
  if (err instanceof AppError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  console.error("Unexpected API error:", err);
  return NextResponse.json(
    { error: "サーバーエラーが発生しました" },
    { status: 500 },
  );
}

/** 業務エラー（4xx を返すための明示的例外） */
export class AppError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "AppError";
    this.status = status;
  }
}
