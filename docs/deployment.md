# デプロイ / 公開ガイド（LAN + インターネット・無料）

本システムは「LAN 内運用を基本」としつつ、「無料の範囲でインターネットからも操作」できます。
推奨構成は **自前ホスト（LAN）+ Cloudflare Tunnel（無料）+ Cloudflare Access（無料・任意）** です。

---

## 0. GUI アプリで起動する（最も簡単・サーバー内蔵）

コマンドラインを使わず、**アプリを起動するだけ**でサーバーを立ち上げられます。
起動するとコントロール画面に LAN URL と QR コードが表示されます。

```bash
npm run app        # ビルドして GUI を起動（開発機での確認用）
npm run dist       # 配布用インストーラを dist-app/ に生成（実行OS上で）
```

配布物（Win: `.exe` / Mac: `.dmg` / Linux: `.AppImage`）をホスト PC に置けば、
ダブルクリックでサーバーが起動します。DB は OS のユーザーデータ領域に保存されます。
インターネット公開（外出先アクセス）は、この GUI 起動に「§2 Cloudflare Tunnel」を併用します。

---

## 1. サーバーを起動する（LAN・コマンドライン）

常時起動できるマシン（撮影中に起動している PC、または常設の Raspberry Pi 等）で動かします。

```bash
# 初回のみ
npm install
cp .env.example .env          # SESSION_SECRET 等を必ず変更
npm run db:push
npm run db:seed

# 本番起動（standalone 出力）
npm run build
node .next/standalone/server.js     # 既定で http://0.0.0.0:3000
```

> standalone 起動時は `.next/static` と `public/` を `.next/standalone/` 配下にコピーすると
> 静的アセットが正しく配信されます（`cp -r .next/static .next/standalone/.next/ && cp -r public .next/standalone/ 2>/dev/null`）。

### LAN からアクセス

- サーバーの LAN IP を確認（例: `192.168.1.50`）
- 同じ LAN のスマホ/PC から `http://192.168.1.50:3000`
  - 登録画面（スマホ）: `http://192.168.1.50:3000/`
  - 管理画面（PC）: `http://192.168.1.50:3000/admin`

### 自動起動（任意・Linux/systemd 例）

```ini
# /etc/systemd/system/sd-card.service
[Unit]
Description=SD Card Management
After=network.target

[Service]
WorkingDirectory=/opt/rinkan-sd
ExecStart=/usr/bin/node /opt/rinkan-sd/.next/standalone/server.js
Environment=NODE_ENV=production
Environment=PORT=3000
Restart=always

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now sd-card
```

---

## 2. インターネット公開：Cloudflare Tunnel（無料）

ポート開放・固定 IP 不要で、HTTPS 付きの固定 URL を得られます。

### 前提

- Cloudflare アカウント（無料）
- （固定 URL を使う場合）Cloudflare に登録したドメイン

### 手順

```bash
# 1. cloudflared をインストール（Linux 例）
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o cloudflared
chmod +x cloudflared && sudo mv cloudflared /usr/local/bin/

# 2. ログイン（ブラウザで認可）
cloudflared tunnel login

# 3. トンネル作成
cloudflared tunnel create sd-card

# 4. DNS と紐付け（自分のドメインのサブドメインを割り当て）
cloudflared tunnel route dns sd-card sd.example.com

# 5. 設定ファイル ~/.cloudflared/config.yml
#    tunnel: <作成時に表示されたID>
#    credentials-file: /home/USER/.cloudflared/<ID>.json
#    ingress:
#      - hostname: sd.example.com
#        service: http://localhost:3000
#      - service: http_status:404

# 6. 起動（常駐）
cloudflared tunnel run sd-card
# systemd 化: sudo cloudflared service install
```

> ドメインが無い場合は `cloudflared tunnel --url http://localhost:3000` で
> 一時 URL（`*.trycloudflare.com`）でも公開できます（URL は起動ごとに変わります）。

---

## 3. 公開時の保護（どちらか／併用）

インターネットに出す場合は必ず保護をかけてください。

### 方式A：Cloudflare Access（推奨・ネットワーク層・無料）

アプリに手を入れず、URL 全体をメール認可（ワンタイムコード）でゲートできます。

1. Cloudflare ダッシュボード → **Zero Trust** → **Access** → **Applications** → **Add an application**
2. **Self-hosted** を選択
3. Application domain に `sd.example.com` を設定
4. **Policy** を追加：
   - Action: **Allow**
   - Include: **Emails** に許可するメンバーのメールアドレスを列挙
     （または Email domain でチームのドメインを許可）
5. 保存。以降、当該 URL へのアクセスは Cloudflare のログイン（メール OTP）必須になります。

無料枠で最大 50 ユーザーまで利用できます。

### 方式B：アプリ層のチーム共通パスゲート（本アプリ内蔵）

`.env` に `TEAM_PASSPHRASE` を設定すると、アプリ全体が共通パス入力（`/gate`）で保護されます。

```bash
# .env
TEAM_PASSPHRASE="our-team-secret-2026"
```

- 未設定（既定）ならゲート無効＝LAN 運用はそのまま。
- 設定時は、初回アクセスで `/gate` に誘導され、正しい共通パスを入れると 30 日間有効な
  Cookie が発行されます（HTTPS では Secure Cookie）。
- 管理者ログインとは独立した「外周の 1 段ゲート」です。

> 推奨：インターネット公開は **方式A（Cloudflare Access）** を基本にし、
> 手軽さを優先する小規模運用では **方式B** を使う、という使い分けが可能です。

---

## 4. バックアップ

SQLite はファイル 1 個（`prisma/dev.db` 等）なので、コピーするだけでバックアップできます。

```bash
# 日次バックアップ（cron 例）
0 23 * * *  cp /opt/rinkan-sd/prisma/dev.db /opt/backup/sd-$(date +\%Y\%m\%d).db
```

- 撮影日の終了後は、管理画面の **CSV エクスポート**でも追跡資料を残せます。
