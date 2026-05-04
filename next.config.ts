import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
  // 서버 번들에서 무거운 네이티브 패키지 제외
  serverExternalPackages: [
    '@remotion/bundler',
    '@remotion/renderer',
    '@remotion/cli',
    'puppeteer-core',
    'esbuild',
  ],
  // Remotion ESM 패키지를 Next.js webpack이 직접 트랜스파일
  transpilePackages: [
    'remotion',
    '@remotion/player',
    '@remotion/core',
  ],
  webpack(config: any) {
    // .mjs 파일을 ES module로 처리
    config.module.rules.push({
      test: /node_modules\/(remotion|@remotion)\/.*\.mjs$/,
      type: 'javascript/auto',
      resolve: { fullySpecified: false },
    });
    return config;
  },
};

export default nextConfig;
