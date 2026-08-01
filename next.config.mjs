/** @type {import('next').NextConfig} */
const nextConfig = {
  // standalone 出力で自前ホスト（LAN内サーバー / Raspberry Pi）に配布しやすくする
  output: "standalone",
};

export default nextConfig;
