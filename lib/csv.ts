// マスタ登録用 CSV のテンプレートとパーサ

export type MasterType = "cameramen" | "cards" | "scenes";

// 各マスタのテンプレート（先頭はヘッダ行。2行目以降は記入例なので置き換え/削除可）
export const CSV_TEMPLATES: Record<MasterType, string> = {
  cameramen: ["name,active,sortOrder", "山田 太郎,true,1", "佐藤 花子,true,2"].join(
    "\r\n",
  ),
  cards: [
    "label,note,active,sortOrder",
    "SD-001,64GB,true,1",
    "SD-002,128GB,true,2",
  ].join("\r\n"),
  scenes: [
    "name,code,active,sortOrder",
    "オープニング,S01,true,1",
    "エンディング,S02,true,2",
  ].join("\r\n"),
};

/** Excel で文字化けしないよう BOM 付きでテンプレート本文を返す */
export function buildTemplate(type: MasterType): string {
  return "﻿" + CSV_TEMPLATES[type] + "\r\n";
}

/** RFC4180 風の簡易 CSV パーサ（引用符・エスケープ・CRLF 対応） */
export function parseCsv(input: string): string[][] {
  let text = input;
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); // BOM 除去
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (ch === ",") {
      row.push(field);
      field = "";
      i++;
      continue;
    }
    if (ch === "\r") {
      i++;
      continue;
    }
    if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i++;
      continue;
    }
    field += ch;
    i++;
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  // 完全な空行は除外
  return rows.filter((r) => !(r.length === 1 && r[0].trim() === ""));
}

/** "true"/"1"/"yes"/"はい" などを真偽値へ。空なら既定値。 */
export function parseBool(v: string | undefined, def = true): boolean {
  if (v == null || v.trim() === "") return def;
  const s = v.trim().toLowerCase();
  if (["true", "1", "yes", "y", "はい", "有効", "○"].includes(s)) return true;
  if (["false", "0", "no", "n", "いいえ", "無効", "×"].includes(s)) return false;
  return def;
}

export function parseIntOr(v: string | undefined, def = 0): number {
  const n = Number((v ?? "").trim());
  return Number.isFinite(n) ? Math.trunc(n) : def;
}
