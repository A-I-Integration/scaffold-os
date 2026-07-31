import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: '/',
        destination: '/aufmass',
        permanent: true,
      },
    ];
  },
};

export default nextConfig;