// Electron メインプロセス
// Next.js サーバーをアプリ内で起動し、コントロールパネル画面を表示する。
const { app, BrowserWindow, ipcMain, shell, clipboard } = require("electron");
const path = require("path");
const os = require("os");
const fs = require("fs");
const http = require("http");
const crypto = require("crypto");

let server = null;
let win = null;
let info = { status: "starting" };

const DEFAULT_PORT = Number(process.env.PORT) || 3000;

function getLanIp() {
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name] || []) {
      if (iface.family === "IPv4" && !iface.internal) return iface.address;
    }
  }
  return "127.0.0.1";
}

function findFreePort(start) {
  return new Promise((resolve) => {
    const tester = http.createServer();
    tester.once("error", () => resolve(findFreePort(start + 1)));
    tester.once("listening", () => {
      tester.close(() => resolve(start));
    });
    tester.listen(start, "0.0.0.0");
  });
}

// 環境変数（DB の場所・シークレット）を、書き込み可能な場所に整える
function prepareEnv(appDir) {
  const userData = app.getPath("userData");
  const dbPath = app.isPackaged
    ? path.join(userData, "sd.db")
    : path.join(appDir, "prisma", "dev.db");

  // パッケージ版の初回起動時は、同梱のシード済みテンプレDBをコピー
  if (app.isPackaged && !fs.existsSync(dbPath)) {
    const template = path.join(appDir, "prisma", "dev.db");
    try {
      if (fs.existsSync(template)) fs.copyFileSync(template, dbPath);
    } catch (e) {
      console.error("DB テンプレートのコピーに失敗:", e);
    }
  }

  process.env.NODE_ENV = "production";
  if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL = "file:" + dbPath;
  }
  // セッションシークレットを userData に永続化（なければ生成）
  if (!process.env.SESSION_SECRET) {
    const secretFile = path.join(userData, "session.secret");
    let secret;
    try {
      secret = fs.readFileSync(secretFile, "utf8").trim();
    } catch {
      secret = crypto.randomBytes(32).toString("hex");
      try {
        fs.writeFileSync(secretFile, secret);
      } catch {
        /* dev では無視 */
      }
    }
    process.env.SESSION_SECRET = secret;
  }
}

async function startServer() {
  const appDir = app.isPackaged
    ? path.join(process.resourcesPath, "app")
    : path.join(__dirname, "..");

  prepareEnv(appDir);

  const next = require("next");
  const nextApp = next({ dev: false, dir: appDir });
  const handler = nextApp.getRequestHandler();
  await nextApp.prepare();

  const port = await findFreePort(DEFAULT_PORT);
  server = http.createServer((req, res) => handler(req, res));
  await new Promise((resolve) => server.listen(port, "0.0.0.0", resolve));

  const ip = getLanIp();
  const base = `http://${ip}:${port}`;
  info = {
    status: "running",
    port,
    ip,
    base,
    registerUrl: `${base}/`,
    adminUrl: `${base}/admin`,
    localUrl: `http://localhost:${port}/`,
    gateEnabled: !!process.env.TEAM_PASSPHRASE,
  };
}

async function createWindow() {
  win = new BrowserWindow({
    width: 720,
    height: 760,
    minWidth: 480,
    title: "記録班 SDカード管理",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.removeMenu?.();
  await win.loadFile(path.join(__dirname, "control.html"));
}

// ── IPC ────────────────────────────────────────────────
ipcMain.handle("get-info", async () => {
  let qr = null;
  if (info.status === "running") {
    try {
      const QRCode = require("qrcode");
      qr = await QRCode.toDataURL(info.registerUrl, { width: 220, margin: 1 });
    } catch (e) {
      console.error("QR 生成失敗:", e);
    }
  }
  return { ...info, qr };
});
ipcMain.handle("open-external", (_e, url) => shell.openExternal(url));
ipcMain.handle("copy", (_e, text) => clipboard.writeText(String(text)));
ipcMain.handle("quit", () => app.quit());

// ── ライフサイクル ─────────────────────────────────────
app.whenReady().then(async () => {
  await createWindow();
  try {
    await startServer();
  } catch (e) {
    info = { status: "error", message: String(e?.message || e) };
    console.error("サーバー起動失敗:", e);
  }
  // 起動完了を画面へ通知
  if (win && !win.isDestroyed()) win.webContents.send("server-updated");

  // 診断用：SD_CAPTURE が指定された場合は画面を撮影して終了
  if (process.env.SD_CAPTURE && win) {
    setTimeout(async () => {
      try {
        const img = await win.webContents.capturePage();
        fs.writeFileSync(process.env.SD_CAPTURE, img.toPNG());
      } catch (e) {
        console.error("capture failed:", e);
      }
      app.quit();
    }, 4500);
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (server) server.close();
  app.quit();
});
