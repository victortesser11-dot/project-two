import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@obras/shared'],
  poweredByHeader: false,
};

export default nextConfig;
