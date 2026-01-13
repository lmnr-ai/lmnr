import { withSentryConfig } from "@sentry/nextjs";
import { type NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    turbopackFileSystemCacheForDev: true,
  },
  reactStrictMode: false,
  logging: {
    fetches: {
      fullUrl: true,
    },
  },
  serverExternalPackages: ["@lmnr-ai/lmnr", "@sentry/nextjs"],
  output: "standalone",
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "Content-Security-Policy",
            value:
              "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://esm.sh https://p.laminar.sh https://us.i.posthog.com https://www.gstatic.com http://www.gstatic.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https: data:; font-src 'self' https: data:; img-src 'self' data: https: blob:; connect-src 'self' https: wss: ws: https://p.laminar.sh https://us.i.posthog.com https://github.com https://api.github.com; frame-src 'self' https://unpkg.com; media-src 'self' https://image.mux.com blob:; object-src 'none'; base-uri 'self'; form-action 'self' https://github.com; frame-ancestors 'none';",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains; preload",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(self), interest-cohort=()",
          },
        ],
      },
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "avatars.githubusercontent.com",
        port: "",
        pathname: "/u/**",
      },
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
        port: "",
        pathname: "/a/**",
      },
    ],
  },

  webpack: (config, { isServer }) => {
    config.resolve.alias["canvas"] = false;

    if (isServer) {
      config.externals.push({
        canvas: "commonjs canvas",
      });
    }
    return config;
  },
  turbopack: {
    resolveExtensions: [".ts", ".tsx", ".js", ".jsx", ".json", ".css", ".scss"],
  },
};

if (process.env.ENVIRONMENT === "PRODUCTION" && process.env.FRONTEND_SENTRY_DSN) {
  module.exports = withSentryConfig(nextConfig, {
    // For all available options, see:
    // https://www.npmjs.com/package/@sentry/webpack-plugin#options

    org: process.env.SENTRY_ORG,
    project: process.env.FRONTEND_SENTRY_PROJECT,

    // Only print logs for uploading source maps in CI
    silent: true,

    // For all available options, see:
    // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

    // Upload a larger set of source maps for prettier stack traces (increases build time)
    widenClientFileUpload: true,

    // Route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
    // This can increase your server load as well as your hosting bill.
    // Note: Check that the configured route will not match with your Next.js middleware, otherwise reporting of client-
    // side errors will fail.
    tunnelRoute: "/monitoring",

    // Automatically tree-shake Sentry logger statements to reduce bundle size
    disableLogger: true,
  });
} else {
  module.exports = nextConfig;
}
