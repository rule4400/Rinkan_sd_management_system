import fs from "fs";
import path from "path";
import { prisma } from "./db";
import { AppError } from "./api";

// SQLite の実ファイルパスを得る。
// - 絶対パス（Electron 本番: file:<userData>/sd.db）はそのまま
// - 相対パス（開発: file:./dev.db）は Prisma 同様 schema ディレクトリ(prisma/)基準
function getDbPath(): string {
  const url = process.env.DATABASE_URL || "file:./dev.db";
  const raw = url.replace(/^file:/, "");
  if (path.isAbsolute(raw)) return raw;
  return path.resolve(process.cwd(), "prisma", raw);
}

function getBackupDir(): string {
  const dir = path.join(path.dirname(getDbPath()), "backups");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function tsString(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}` +
    `-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
  );
}

export type BackupInfo = {
  name: string;
  createdAt: string;
  size: number;
  label: string | null;
};

function infoOf(dir: string, name: string): BackupInfo {
  const stat = fs.statSync(path.join(dir, name));
  const m = name.match(/^backup-\d{8}-\d{6}(?:_(.+))?\.db$/);
  return {
    name,
    createdAt: stat.mtime.toISOString(),
    size: stat.size,
    label: m?.[1] ?? null,
  };
}

/** バックアップを作成する。WAL をチェックポイントしてから DB ファイルを複製。 */
export async function createBackup(label?: string): Promise<BackupInfo> {
  const dbPath = getDbPath();
  if (!fs.existsSync(dbPath)) {
    throw new AppError("データベースファイルが見つかりません。", 500);
  }
  // WAL を本体へ反映（WAL 未使用なら無害）
  try {
    await prisma.$executeRawUnsafe("PRAGMA wal_checkpoint(TRUNCATE);");
  } catch {
    /* 無視 */
  }
  const dir = getBackupDir();
  const safe = label ? "_" + label.replace(/[^\w-]/g, "").slice(0, 40) : "";
  const name = `backup-${tsString(new Date())}${safe}.db`;
  fs.copyFileSync(dbPath, path.join(dir, name));
  return infoOf(dir, name);
}

/** バックアップ一覧（新しい順）。 */
export function listBackups(): BackupInfo[] {
  const dir = getBackupDir();
  return fs
    .readdirSync(dir)
    .filter((f) => /^backup-.*\.db$/.test(f))
    .map((f) => infoOf(dir, f))
    .sort((a, b) => (a.name < b.name ? 1 : -1));
}

function assertSafeName(name: string) {
  if (!/^backup-[\w-]+\.db$/.test(name) || name.includes("..")) {
    throw new AppError("不正なバックアップ名です。", 400);
  }
}

/**
 * 指定バックアップへロールバックする。
 * 復元前に現在の状態を自動バックアップし、復元自体もやり直せるようにする。
 */
export async function restoreBackup(name: string): Promise<{ restored: string }> {
  assertSafeName(name);
  const dir = getBackupDir();
  const src = path.join(dir, name);
  if (!fs.existsSync(src)) {
    throw new AppError("指定したバックアップが見つかりません。", 404);
  }
  // 復元前の現状を退避
  await createBackup("before-restore");

  const dbPath = getDbPath();
  // 接続を一旦切ってからファイルを差し替える（次回クエリで再接続される）
  await prisma.$disconnect();
  fs.copyFileSync(src, dbPath);
  // 古い WAL/journal が残っていると差し替え後のデータを上書きしてしまうため削除
  for (const sfx of ["-wal", "-shm", "-journal"]) {
    const p = dbPath + sfx;
    if (fs.existsSync(p)) {
      try {
        fs.unlinkSync(p);
      } catch {
        /* 無視 */
      }
    }
  }
  return { restored: name };
}

/**
 * 全データ削除。実行前に必ず自動バックアップを取る。
 *  - scope "transactions": 利用記録・シーン紐づけ・監査ログのみ削除（マスタは残す）
 *  - scope "all": 上記に加えマスタ（カメラマン/カード/シーン）も削除（管理者は残す）
 */
export async function wipeData(scope: "transactions" | "all") {
  await createBackup(scope === "all" ? "before-wipe-all" : "before-wipe");
  await prisma.$transaction(async (tx) => {
    await tx.recordScene.deleteMany({});
    await tx.auditLog.deleteMany({});
    await tx.usageRecord.deleteMany({});
    if (scope === "all") {
      await tx.scene.deleteMany({});
      await tx.card.deleteMany({});
      await tx.cameraman.deleteMany({});
    }
  });
}
