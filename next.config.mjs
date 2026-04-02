import { imageHosts } from './image-hosts.config.mjs';

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  distDir: process.env.DIST_DIR || '.next',
  serverExternalPackages: ['pg'],
  images: {
    remotePatterns: imageHosts,
    minimumCacheTTL: 60,
  },
};
export default nextConfig;
