import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@obras/shared', '@obras/emails'],
  poweredByHeader: false,
};

export default nextConfig;
