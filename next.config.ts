import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // API 라우트 body 크기 제한 (참조 이미지 전송용)
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
};

export default nextConfig;
