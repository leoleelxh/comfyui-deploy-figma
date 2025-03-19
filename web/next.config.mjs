import { recmaPlugins } from "./src/mdx/recma.mjs";
import { rehypePlugins } from "./src/mdx/rehype.mjs";
import { remarkPlugins } from "./src/mdx/remark.mjs";
import withSearch from "./src/mdx/search.mjs";
import nextMDX from "@next/mdx";

const withMDX = nextMDX({
  options: {
    remarkPlugins,
    rehypePlugins,
    recmaPlugins,
  },
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  pageExtensions: ["js", "jsx", "ts", "tsx", "mdx"],
  eslint: {
    ignoreDuringBuilds: true,
  },
  // 添加输出配置，支持 Cloudflare Pages
  output: "standalone",
  // 添加图片优化配置
  images: {
    unoptimized: true, // 在 Cloudflare 环境中禁用图片优化
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.r2.dev",
      },
      {
        protocol: "http",
        hostname: "localhost",
      },
    ],
  },
  // 实验性配置
  experimental: {
    instrumentationHook: true,
    serverComponentsExternalPackages: ["sharp"],
  },
  // 添加 webpack 配置来处理缺少的 Node.js 模块
  webpack: (config, { isServer, nextRuntime }) => {
    // 仅为 Edge runtime 添加 polyfills
    if (nextRuntime === "edge") {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        crypto: false, // 设置为 false 让 Cloudflare 使用内置的实现
        stream: false, // 设置为 false 让 Cloudflare 使用内置的实现
        buffer: false,
        util: false,
      };
    }
    
    // 不要排除jsonwebtoken，确保它被正确处理
    if (config.module && config.module.noParse) {
      const noParse = Array.isArray(config.module.noParse) 
        ? config.module.noParse 
        : [config.module.noParse];
      
      config.module.noParse = noParse.filter(pattern => 
        !String(pattern).includes('jsonwebtoken')
      );
    }
    
    return config;
  },
  // 从环境中读取配置，不再硬编码
  env: {
    // 不再硬编码 ENVIRONMENT 值
  },
};

export default withSearch(withMDX(nextConfig));