import type { NextConfig } from "next";

const fixtureId =
  process.env.NODE_ENV !== "production" &&
  /^[a-f0-9]{32}$/.test(process.env.KONJ_HTTP_TEST_ID || "")
    ? process.env.KONJ_HTTP_TEST_ID
    : undefined;
const nextConfig: NextConfig = {
  ...(fixtureId
    ? {
        distDir: ".next/http-" + fixtureId,
        typescript: {
          tsconfigPath: ".next/http-config/" + fixtureId + "/tsconfig.json",
        },
      }
    : {}),
  /* config options here */
  cacheComponents: false,
  poweredByHeader: false,
  logging: {
    incomingRequests: false,
    serverFunctions: false,
    browserToTerminal: false,
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "no-referrer" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },

  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
