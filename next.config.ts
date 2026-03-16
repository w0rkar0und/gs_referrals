import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      { source: '/submit', destination: '/referrals/submit', permanent: true },
      { source: '/admin', destination: '/referrals/admin', permanent: true },
      { source: '/admin/:path*', destination: '/referrals/admin/:path*', permanent: true },
    ]
  },
};

export default nextConfig;
