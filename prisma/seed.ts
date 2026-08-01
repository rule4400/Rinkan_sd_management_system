import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  // ── 管理者アカウント ──
  const username = process.env.ADMIN_USERNAME || "admin";
  const password = process.env.ADMIN_PASSWORD || "admin1234";
  const passwordHash = await bcrypt.hash(password, 10);

  await prisma.adminUser.upsert({
    where: { username },
    update: {},
    create: { username, passwordHash },
  });
  console.log(`✔ 管理者アカウント: ${username}`);

  // ── マスタのサンプルデータ（既に存在すればスキップ） ──
  const cameramanCount = await prisma.cameraman.count();
  if (cameramanCount === 0) {
    await prisma.cameraman.createMany({
      data: [
        { name: "山田 太郎", sortOrder: 1 },
        { name: "佐藤 花子", sortOrder: 2 },
        { name: "鈴木 一郎", sortOrder: 3 },
        { name: "田中 美咲", sortOrder: 4 },
      ],
    });
    console.log("✔ カメラマン サンプル4件を作成");
  }

  const cardCount = await prisma.card.count();
  if (cardCount === 0) {
    await prisma.card.createMany({
      data: Array.from({ length: 12 }, (_, i) => ({
        label: `SD-${String(i + 1).padStart(3, "0")}`,
        note: i < 6 ? "128GB" : "256GB",
        sortOrder: i + 1,
      })),
    });
    console.log("✔ カード サンプル12件を作成");
  }

  const sceneCount = await prisma.scene.count();
  if (sceneCount === 0) {
    await prisma.scene.createMany({
      data: [
        { name: "オープニング", code: "S01", sortOrder: 1 },
        { name: "インタビューA", code: "S02", sortOrder: 2 },
        { name: "インタビューB", code: "S03", sortOrder: 3 },
        { name: "会場全景", code: "S04", sortOrder: 4 },
        { name: "ステージ本番", code: "S05", sortOrder: 5 },
        { name: "エンディング", code: "S06", sortOrder: 6 },
      ],
    });
    console.log("✔ シーン サンプル6件を作成");
  }

  console.log("シードが完了しました。");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
