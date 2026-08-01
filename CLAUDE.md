# CLAUDE.md — コーディングエージェント向けクイックリファレンス

記録班 SDカード管理システム。映像撮影で使う SD カードの **持ち出し / 予備 / 仮提出 / 提出** を
追跡し、紛失・トラブル時に「いつ・誰が・どのカードで・どのシーンを撮ったか」を即座に辿れる
Web アプリ + サーバー内蔵デスクトップアプリ（Electron）。UI・コメント・コミットは日本語。

> 引き継ぎの全体像・現状・次の一手は **[docs/HANDOFF.md](docs/HANDOFF.md)** を参照。
> 要件と設計の一次情報は **[docs/system-design.md](docs/system-design.md)**、配布/公開は **[docs/deployment.md](docs/deployment.md)**。

## 技術スタック
- **Next.js 15（App Router）+ TypeScript** … 画面と API を1アプリで提供
- **Prisma + SQLite** … 単一ファイル DB（`file:` 接続）
- **Tailwind CSS**
- **Electron** … Next サーバーをアプリ内で起動し、LAN URL と QR を表示するコントロール画面
- 補助: `zod`（入力検証）, `bcryptjs`（管理者PW）, `qrcode`

## よく使うコマンド
```bash
npm install            # 依存導入（postinstall で prisma generate）
cp .env.example .env   # 初回のみ。DATABASE_URL 等が必要
npm run dev            # 開発サーバー http://localhost:3000
npm run build          # prisma generate && next build（型チェック＝実質のCI）
npm run lint           # next lint
npm run db:reset       # DBを初期化して seed（※下の注意参照）
npm run db:seed        # マスタ等の初期データ投入
npm run app            # next build して Electron 起動（GUIコントロール画面）
npm run dist           # 配布物ビルド: mac=dmg / win=nsis / linux=AppImage（dist-app/へ）
```

### DB リセットの注意（重要）
`npm run db:reset` は `prisma db push --force-reset`（**全データ破壊**）を含む。
Prisma は「Claude Code から呼ばれた」場合に安全ガードでこれを止める。エージェント環境では
代わりに **非破壊の初期化** を使うこと:
```bash
rm -f prisma/dev.db && npx prisma db push && npm run db:seed
```
CI や実ユーザーのシェルでは `npm run db:reset` がそのまま通る。

## ディレクトリ構成
```
app/
  page.tsx                     利用者フロー(/)。カメラマン→操作→カード→(確認)→シーン(複数可)→完了/やり直し
  gate/page.tsx                チーム共通パス入力(公開時のみ)
  admin/layout.tsx             認証ガード + ナビ(ダッシュボード/利用記録/マスタ/設定/高度な設定)
  admin/page.tsx               ダッシュボード(件数・未提出アラート)
  admin/login/page.tsx         管理者ログイン(+利用者画面へのリンク)
  admin/records/page.tsx       利用記録一覧・フィルタ・CSV・修正/削除/やり直しモーダル
  admin/masters/page.tsx       マスタCRUD + CSVテンプレDL/インポート
  admin/settings/page.tsx      管理者パスワード変更
  admin/advanced/page.tsx      バックアップ/ロールバック + 全データ削除(危険ゾーン)
  api/                         下記「API」参照
lib/
  db.ts            Prisma シングルトン
  usage.ts         ★中核: 業務ロジック(状態遷移)・候補算出・やり直し(undo)・監査ログ
  validation.ts    zod スキーマ
  api.ts           ok() / handleError() / AppError（API 共通）
  auth.ts          管理者セッション(署名Cookie) + bcrypt
  cookies.ts       Cookie Secure 属性の判定（LAN=HTTP対応）
  gate.ts          チーム共通パスゲート
  records-query.ts 利用記録の where/orderBy 構築（複数選択・複数シーン対応）
  backup.ts        バックアップ作成/一覧/復元 + 全削除（SQLiteファイル操作）
  csv.ts           マスタCSVのテンプレート生成 & パーサ
prisma/
  schema.prisma    データモデル（下記）
  seed.ts          初期マスタ + 管理者(admin/admin1234)
electron/
  main.js          Next を内蔵起動 + コントロールウィンドウ + QR/LAN URL
  preload.js / control.html
middleware.ts       チーム共通パスゲートの適用
.github/workflows/build-macos.yml  macOS(.dmg) をネイティブビルドする CI
```

## データモデル（prisma/schema.prisma）
- `Cameraman` / `Card`(label一意) / `Scene` … マスタ（active, sortOrder）
- `UsageRecord` … 1レコード=1カードの1サイクル。`status` と各日時を持つ
  - `status`: `spare_held` | `checked_out` | `provisional` | `submitted`
  - `kind`: `checkout` | `spare`
  - 日時: `checkedOutAt` / `spareAt` / `provisionalAt` / `submittedAt`
  - `sceneId` = **代表シーン（先頭）**。複数シーンは `RecordScene` が正
- `RecordScene` … UsageRecord × Scene の中間テーブル（**複数シーン**）。`onDelete: Cascade`
- `AuditLog` … 追記専用。`action`(create/update/correct/delete/undo) と before/after(JSON, sceneIds含む)
- `AdminUser` … username 一意 + passwordHash(bcrypt)

## 状態遷移（lib/usage.ts）
```
在庫 --checkout(シーン複数)--> checked_out
在庫 --spare--------------->  spare_held
spare_held --spare-to-checkout(シーン)--> checked_out
checked_out|spare_held --provisional(シーン)--> provisional   （撮影済み・カードは保持中）
checked_out|spare_held|provisional --submit(シーン)--> submitted
どの操作も undo(直前の監査ログから復元/削除)で取り消し可能
```
- **1カード=同時に1つの未提出(open)レコード**のみ（`OPEN_STATUSES=[spare_held,checked_out,provisional]`）。
  二重使用は 409 で防止（`findOpenRecord`）。
- 破壊的操作（復元・全削除）の前に **必ず自動バックアップ**（`before-restore`/`before-wipe`）。

## API（app/api/）
- 公開（利用者）: `GET /api/cameramen`, `GET /api/scenes`, `GET /api/cards/candidates?mode=checkout|spare|provisional|submit&cameramanId=`,
  `POST /api/usage/{checkout,spare,spare-to-checkout,provisional,submit,undo}`, `POST /api/gate`
- 認証: `POST /api/auth/{login,logout}`, `GET /api/admin/me`
- 管理（`requireAdmin()` 必須）: `/api/admin/{cameramen,cards,scenes}`(+`/[id]`),
  `/api/admin/dashboard`, `/api/admin/password`,
  `/api/admin/records`(+`/[id]` PATCH修正/DELETE, `/export` CSV),
  `/api/admin/masters/{template,import}`,
  `/api/admin/backups`(GET一覧/POST作成) + `/restore`,
  `/api/admin/danger/wipe`（確認フレーズ必須）

## コーディング規約（既存に合わせる）
- API ルートは `try { … } catch (e) { return handleError(e); }`。成功は `ok(data)`。
  業務エラーは `throw new AppError(msg, status)`。入力は zod `schema.parse(await req.json())`。
- 管理系ルートは冒頭で `await requireAdmin()`。
- **業務ロジックは lib/usage.ts に集約**し、`prisma.$transaction` 内で実行 + `logAudit`。
  状態を変える操作は before/after スナップショット（`snapshot()` が sceneIds を含める）を残す。
- ルートファイル（`route.ts`）は HTTP メソッド以外を **export しない**（Next が拒否する）。
- 画面は既存のクラス（`tap-btn`, `field`, `badge`, `bg-brand` 等）を踏襲。

## 落とし穴 / 触るとき注意（macOS配布・DB）
- **Electron パッケージング**: `package.json` の `build` は **asar 無効**。理由:
  (1) electron-builder は `node_modules/.prisma`（生成物）を通常収集で枝刈りするため
  `extraResources` で `app/node_modules/.prisma` へ明示コピー、
  (2) `electron/main.js` の packaged パス `resourcesPath/app` は asar 無効時のみ正しい。
  **asar を安易に有効化しない**（両方壊れる）。
- **Prisma エンジン**: `schema.prisma` の `binaryTargets=["native","darwin","darwin-arm64"]` で
  配布先 macOS 用エンジンを同梱。消さない。
- **macOS ビルドは mac 上で**行う（Linux クロスビルドの .app は未署名 arm64 のため実機で起動不可）。
  CI（`.github/workflows/build-macos.yml`, macos-14）で `.dmg` を生成しアーティファクト化。
  `dist` スクリプトは `electron-builder --publish never`（CI 自動publishでの失敗を防ぐ）。
- **Cookie Secure**: `lib/cookies.ts` は `x-forwarded-proto: https` の時だけ Secure を付ける
  （LAN の HTTP で認証が壊れないように）。`COOKIE_SECURE` env で上書き可。
- **next.config**: `output: "standalone"` だが Electron は `next()` のプログラム API で起動するので動作OK。
  `next start` は非対応の警告を出す（無害）。
- **スキーマ変更にマイグレーションは無い**（`prisma db push` 運用）。既存インストールの
  `userData/sd.db` は自動移行されない点に注意（HANDOFF の「既知の課題」参照）。

## 動作確認のしかた
- 手軽: `npm run dev` → ブラウザ。
- 本番相当（Electron と同じ起動経路）: `NODE_ENV=production` で `next({dev:false}).prepare()` +
  自前 http サーバーを立て、`curl` で API を叩く（HANDOFF に手順あり）。
- 変更後は最低限 `npm run build`（型 + lint）を通す。

## リポジトリ状態
- 作業ブランチ: `claude/blissful-galileo-g8kq0n`。PR **#1**（base: `main`）。
- 詳細な現状と TODO は **docs/HANDOFF.md**。
