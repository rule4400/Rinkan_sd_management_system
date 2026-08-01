# 引き継ぎ指示書（HANDOFF）

別のコーディングエージェント / 開発者がこのプロジェクトを継続するための引き継ぎ資料です。
まず **[/CLAUDE.md](../CLAUDE.md)**（構成・コマンド・規約・落とし穴の要点）に目を通し、
本書で「現状・直近の変更・検証・既知の課題・次の一手」を把握してください。
要件と設計の一次情報は **[system-design.md](system-design.md)**、配布/公開は **[deployment.md](deployment.md)**。

---

## 1. これは何か（ドメイン用語）
映像制作チーム（記録班）が撮影で使う **SD カード**の受け渡しを追跡するアプリ。
| 用語 | 意味 |
|---|---|
| 持ち出し（checkout） | これから撮影に使うためカードを持ち出す。シーンを紐づける |
| 予備（spare） | 予備として確保（シーン未定）。後で「予備→持ち出し」に転用可 |
| 仮提出（provisional） | **撮影は完了したが、カードはまだカメラマンが保持中**の状態 |
| 提出（submit） | カードを正式に提出。仮提出・持ち出し・予備のいずれからも確定できる |
| やり直し（undo） | 直前の操作を取り消す（誤登録・誤操作の救済） |
| シーン（複数可） | 1枚のカードに複数シーンが記録され得るため、複数選択できる |

利用者はスマホで登録画面（`/`）、管理者は PC で管理画面（`/admin`）を使う。
LAN 運用が基本。インターネット公開時はチーム共通パス or Cloudflare Access で保護（deployment.md）。

---

## 2. 現在の状態
- **作業ブランチ**: `claude/blissful-galileo-g8kq0n`
- **PR**: #1（base `main`）。実装差分をレビュー可能な形で載せている。
- **CI**: `.github/workflows/build-macos.yml` が push 毎に macOS(.dmg) をビルドし、
  Actions のアーティファクト `SDカード管理-macOS-arm64-dmg` として出力。
- `npm run build`（型 + lint）は成功する状態。

### 直近セッションで追加した機能（すべて実装済み・実機検証済み）
1. 管理ログイン画面に「利用者画面へ」ボタン
2. マスタ登録用 **CSV テンプレDL** + **CSV インポート**（既存の名前/カードNoは重複スキップ）
3. **「高度な設定」タブ** … **全データ削除**（確認フレーズ必須。`利用記録を全て削除` / `全データを初期化`）
4. **バックアップ**作成 + **日時を選んでロールバック**（復元）
5. **やり直し（undo）** … 監査ログの before スナップショットから復元、作成操作は削除
6. **仮提出（provisional）** … 撮影済み・カード保持中。UI/API/状態遷移を追加
7. **提出で仮提出カードを正式提出に確定**（submit が provisional からも遷移可能に）
8. **シーンの複数選択**（`RecordScene` 中間テーブルで多対多化。一覧/フィルタ/CSV/修正すべて対応）
9. 安全策: 破壊的操作前の**自動バックアップ**、全操作の**監査ログ**記録

### 実装以前から入っている土台
登録フロー（持ち出し/予備/予備→持ち出し）、管理ダッシュボード、利用記録の検索・フィルタ・
修正・削除（監査ログ付き）、マスタ CRUD、CSV エクスポート、管理者認証・パスワード変更、
チーム共通パスゲート、Electron 内蔵サーバー + QR 表示。

---

## 3. ローカルでの動かし方
```bash
npm install
cp .env.example .env
# 開発サーバー
npm run dev            # http://localhost:3000 （/ が利用者、/admin が管理）
# 初期マスタ + 管理者(admin/admin1234) が無ければ:
rm -f prisma/dev.db && npx prisma db push && npm run db:seed
```
Electron の GUI で確認したい場合は `npm run app`。

### 本番相当（Electron と同じ起動経路）でのスモークテスト
Electron は `next({ dev:false }).prepare()` + 自前 http サーバーで動く。これを再現して curl で叩くと、
本番モードの Prisma / 認証 / 状態遷移を検証できる。リポジトリ直下に一時ファイルを置いて実行:
```js
// _sim.js
const http = require("http"), path = require("path");
process.env.NODE_ENV = "production";
process.env.DATABASE_URL = "file:" + path.join(__dirname, "prisma", "dev.db");
process.env.SESSION_SECRET = "dev-only-secret";
(async () => {
  const next = require("next");
  const app = next({ dev: false, dir: __dirname });
  const handler = app.getRequestHandler();
  await app.prepare();
  http.createServer((req, res) => handler(req, res)).listen(3939, () => console.log("READY"));
})();
```
```bash
node _sim.js &            # READY を待つ
curl -s localhost:3939/api/cameramen
# 管理APIは Cookie が要る:
curl -s -c cj.txt -X POST localhost:3939/api/auth/login -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"admin1234"}'
curl -s -b cj.txt localhost:3939/api/admin/records
# 後片付け: サーバー停止 & 一時ファイル削除
```
> 検証済みの代表シナリオ: 持ち出し(複数シーン)→仮提出→提出 / undoで作成取消 /
> バックアップ作成→全削除→ロールバックで復元 / CSVテンプレDL・インポート / 複数シーン絞り込み。

### 変更後に最低限通すこと
```bash
npm run build   # prisma generate + next build（型エラー・lint をここで検出）
```

---

## 4. macOS アプリのビルドと配布（重要な注意）
- **必ず macOS 上でビルドする。** Linux でクロスビルドした `.app` は
  未署名の arm64 バイナリのため、Apple Silicon 実機で起動時にクラッシュする（署名要件）。
- **推奨**: CI（`build-macos.yml`, `macos-14` = Apple Silicon）に任せる。push すると `.dmg` を
  アーティファクト出力。ローカル Mac なら `npm install && cp .env.example .env && npm run dist`。
- `dist` は `electron-builder --publish never`。これが無いと CI 検知で GitHub Releases への
  自動 publish を試み、`GH_TOKEN` 未設定で **DMG 生成後に** 失敗する（過去に発生 → 修正済み）。
- パッケージング設定（`package.json` の `build`）は **asar 無効 + extraResources で .prisma 同梱** が要。
  詳細は CLAUDE.md「落とし穴」を参照。

---

## 5. 環境変数（.env / .env.example）
| 変数 | 用途 | 備考 |
|---|---|---|
| `DATABASE_URL` | SQLite の場所 | 開発は `file:./dev.db`（prisma/基準）。Electron本番は userData 配下 |
| `SESSION_SECRET` | セッション署名 | **本番で必ず変更** |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | seed 作成の初期管理者 | 既定 admin/admin1234。**本番で変更** |
| `TEAM_PASSPHRASE` | チーム共通パスゲート | 空=無効（LANはそのまま）。設定で全体を `/gate` 保護 |
| `COOKIE_SECURE` | Cookie Secure の明示制御 | 既定は proto 自動判定。`true`/`false` で上書き |

Electron 本番では `electron/main.js` が `DATABASE_URL` と `SESSION_SECRET` を userData 配下に用意する。

---

## 6. 既知の課題 / リスク（次の担当者が把握すべき点）
1. **スキーマ移行の仕組みが無い**。`prisma db push` 運用のため、**既にインストール済みアプリの
   `userData/sd.db` は新スキーマに自動移行されない**（今回 `provisionalAt` 列と `record_scenes`
   テーブルを追加）。旧DBのまま新アプリを起動すると Prisma がテーブル不足でエラーになり得る。
   → 対策候補: 起動時に `prisma migrate deploy` を回す構成へ移行、または electron 起動時に
   スキーマ同期（`db push` 相当）を実行、あるいは初回起動時にバージョン確認して案内。現状は
   「新規インストールはテンプレDBで新スキーマ」なので、実運用データが無いうちに移行方針を決めるのが吉。
2. **利用者向け API は未認証**（`/api/usage/*`, `/api/cards/candidates`, `/api/cameramen`,
   `/api/scenes`）。LAN 前提の設計。インターネット公開時は `TEAM_PASSPHRASE` か Cloudflare Access で
   前段保護する想定（deployment.md）。undo も未認証なので、公開運用では見直す余地あり。
3. **バックアップ/復元は単一 SQLite ファイルのコピー方式**（`lib/backup.ts`）。復元時は
   `prisma.$disconnect()` → ファイル差し替え → WAL/journal 削除、で次クエリから再接続。
   同時アクセスが多い環境や DB を別方式へ変えた場合は要再設計。復元後はクライアント側で
   再読み込みが必要（画面にその旨表示済み）。
4. **`output: standalone`** は現状 Electron 起動経路では使っていない（プログラム API 起動）。
   Pi 等での別ホスティング用に残置。整理する場合は deployment.md と合わせて検討。
5. **CSV インポートは新規作成のみ**（重複はスキップ、更新はしない）。マスタの一括更新が必要なら
   upsert 対応を追加する余地。
6. **監査ログの参照整合**: レコード削除時は `auditLog.usageRecordId` を null にしてから削除している
   （履歴は `actorLabel` と before スナップショットで追える）。undo/削除まわりを触るときは
   この方針を崩さないこと。

---

## 7. 次の一手（TODO バックログの候補）
優先度は状況に応じて調整。着手前に PR #1 のレビュー方針とすり合わせること。
- [ ] **スキーマ移行方針の確立**（上記課題1）。`prisma migrate` 導入 or 起動時同期。
- [ ] ダッシュボードに **仮提出の一覧/アラート**（長時間 provisional のまま等）。
- [ ] 提出フローで、仮提出済みカードの **既存シーンを自動プリセット**（今は再選択）。
- [ ] CSV インポートの **更新（upsert）モード** と、取り込み前プレビュー。
- [ ] 利用記録一覧の **ページング UI**（API は `page`/`pageSize` 対応済み、画面は未実装）。
- [ ] **監査ログ閲覧画面**（現在は DB 内のみ。トラブル追跡用に UI 化）。
- [ ] バックアップの **自動定期取得** / 保持世代数の上限管理。
- [ ] 公開時の利用者 API 保護強化（レート制限・簡易 PIN 等）。
- [ ] E2E テスト（Playwright 等）や API テストの自動化（現状は手動スモーク）。
- [ ] Windows/Linux 版のビルド CI（現状 macOS のみ）。

---

## 8. 変更を入れるときの流れ
1. `claude/blissful-galileo-g8kq0n` で作業（別途指示が無ければ）。
2. ロジックは `lib/`、API は薄く（検証→lib 呼び出し→ok/handleError）。UI は既存クラスに合わせる。
3. スキーマを変えたら `npx prisma db push`（開発DB）で反映し、影響する一覧/CSV/修正画面も更新。
4. `npm run build` を通す + 上記スモークで主要フローを確認。
5. 破壊的/不可逆な操作を足すときは **自動バックアップ + 監査ログ + 確認フレーズ** の既存パターンを踏襲。
6. コミットは日本語で意図を明記。PR は #1 に積むか、指示に従う。
