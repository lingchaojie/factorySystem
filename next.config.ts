import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    localPatterns: [
      {
        pathname: "/api/order-drawings/**",
        search: "?preview=1",
      },
    ],
  },
};

export default nextConfig;
