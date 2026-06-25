import { z } from "zod";

// ── 利用者操作 ──────────────────────────────────────────────

// シーンは複数選択可（1つ以上）
const sceneIds = z
  .array(z.number().int().positive())
  .min(1, "シーンを1つ以上選択してください");

export const checkoutSchema = z.object({
  cameramanId: z.number().int().positive(),
  cardId: z.number().int().positive(),
  sceneIds,
});

export const spareSchema = z.object({
  cameramanId: z.number().int().positive(),
  cardId: z.number().int().positive(),
});

export const spareToCheckoutSchema = z.object({
  usageRecordId: z.number().int().positive(),
  sceneIds,
});

export const provisionalSchema = z.object({
  usageRecordId: z.number().int().positive(),
  sceneIds,
});

export const submitSchema = z.object({
  usageRecordId: z.number().int().positive(),
  sceneIds,
});

export const undoSchema = z.object({
  usageRecordId: z.number().int().positive(),
});

// ── マスタ CRUD ────────────────────────────────────────────

export const cameramanInputSchema = z.object({
  name: z.string().trim().min(1, "名前を入力してください"),
  active: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

export const cardInputSchema = z.object({
  label: z.string().trim().min(1, "カードNoを入力してください"),
  note: z.string().trim().optional().nullable(),
  active: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

export const sceneInputSchema = z.object({
  name: z.string().trim().min(1, "シーン名を入力してください"),
  code: z.string().trim().optional().nullable(),
  active: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

// ── マスタ CSV インポート ──────────────────────────────────

export const masterImportSchema = z.object({
  type: z.enum(["cameramen", "cards", "scenes"]),
  csv: z.string().min(1, "CSV の内容が空です"),
});

// ── 管理者：記録修正 ───────────────────────────────────────

export const recordUpdateSchema = z.object({
  cardId: z.number().int().positive().optional(),
  cameramanId: z.number().int().positive().optional(),
  sceneId: z.number().int().positive().nullable().optional(),
  sceneIds: z.array(z.number().int().positive()).optional(),
  kind: z.enum(["checkout", "spare"]).optional(),
  status: z
    .enum(["spare_held", "checked_out", "provisional", "submitted"])
    .optional(),
  checkedOutAt: z.string().datetime().nullable().optional(),
  spareAt: z.string().datetime().nullable().optional(),
  provisionalAt: z.string().datetime().nullable().optional(),
  submittedAt: z.string().datetime().nullable().optional(),
  note: z.string().nullable().optional(),
});

export const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1, "現在のパスワードを入力してください"),
  newPassword: z
    .string()
    .min(8, "新しいパスワードは8文字以上にしてください"),
});

export const gateSchema = z.object({
  passphrase: z.string().min(1),
});

// ── 高度な設定：バックアップ / 全削除 ──────────────────────

export const backupRestoreSchema = z.object({
  name: z.string().min(1),
});

export const dangerWipeSchema = z.object({
  // "transactions" = 利用記録と履歴のみ / "all" = マスタ含む全初期化
  scope: z.enum(["transactions", "all"]),
  confirm: z.string(),
});

export type CheckoutInput = z.infer<typeof checkoutSchema>;
export type SpareInput = z.infer<typeof spareSchema>;
