import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Output standalone dipakai supaya image docker kecil (lihat Dockerfile).
  output: 'standalone',
  reactStrictMode: true,
  serverExternalPackages: ['pg'],
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
