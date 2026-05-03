import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // API 라우트 body 크기 제한 (참조 이미지 전송용)
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
  // @remotion/bundler와 @remotion/renderer는 자체 webpack을 사용하므로
  // Next.js 번들링에서 제외 (serverComponentsExternalPackages 대신 serverExternalPackages 사용)
  serverExternalPackages: [
    '@remotion/bundler',
    '@remotion/renderer',
    '@remotion/cli',
    'puppeteer-core',
    'esbuild',
  ],
};

export default nextConfig;
