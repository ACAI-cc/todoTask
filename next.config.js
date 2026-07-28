/** @type {import('next').NextConfig} */

// 当 BUILD_TARGET=electron 时，启用静态导出模式
// 用于 Electron 打包后通过 file:// 协议加载
const isElectronBuild = process.env.BUILD_TARGET === "electron";

const nextConfig = {
  reactStrictMode: true,
  // Electron 打包时需要静态导出
  ...(isElectronBuild
    ? {
        output: "export",
        // 使用相对路径前缀，确保 file:// 协议下资源加载正确
        assetPrefix: "./",
        // 禁用图片优化（静态导出不支持）
        images: { unoptimized: true },
      }
    : {}),
};

module.exports = nextConfig;
