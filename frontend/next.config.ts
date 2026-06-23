import { withSentryConfig } from "@sentry/nextjs";
import { type NextConfig } from "next";

// Baked at BUILD time (not a runtime flip) — Next inlines basePath into the
// standalone bundle's asset URLs. Empty/unset => root-served (the regular
// `frontend-ee` image is byte-identical). The `frontend-ee-basepath` image is
// built with NEXT_PUBLIC_BASE_PATH=/lmnr so self-hosters can reverse-proxy
// Laminar under a sub-path without a dedicated domain.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || undefined;

const nextConfig: NextConfig = {
  basePath,
  env: {
    LAMINAR_CLOUD: process.env.LAMINAR_CLOUD,
  },
  experimental: {
    turbopackFileSystemCacheForDev: true,
    // Rewrites barrel imports from "recharts" into direct submodule imports at build
    // time. Reshapes the chunk graph to avoid the Turbopack production interop split that
    // left recharts' internal usePrefersReducedMotion unlinked ("(0, v.usePrefersReducedMotion) is not a function").
    optimizePackageImports: ["recharts"],
  },
  reactStrictMode: false,
  logging: {
    fetches: {
      fullUrl: true,
    },
  },
  serverExternalPackages: ["@lmnr-ai/lmnr", "@sentry/nextjs"],
  output: "standalone",
  async rewrites() {
    // Forward LEGACY NextAuth genericOAuth callbacks to Better Auth's handler so
    // self-hosted Okta/Keycloak/Azure SSO keeps working with no IdP change (paired
    // with the pinned redirectURI in lib/auth.ts). `beforeFiles` to beat the
    // `/api/auth/[...all]` catch-all; scoped to these 3 ids ONLY (NOT github/google).
    return {
      beforeFiles: [
        { source: "/api/auth/callback/okta", destination: "/api/auth/oauth2/callback/okta" },
        { source: "/api/auth/callback/keycloak", destination: "/api/auth/oauth2/callback/keycloak" },
        { source: "/api/auth/callback/azure-ad", destination: "/api/auth/oauth2/callback/microsoft-entra-id" },
      ],
    };
  },
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
            // base-uri is intentionally omitted: rrweb-player rebuilds browser session snapshots by injecting a <base href="<recorded-origin>"> so relative URLs inside the captured DOM resolve against the original site. base-uri 'self' blocked that and the replay lost every relative asset.
            value:
              "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://unpkg.com https://esm.sh https://p.laminar.sh https://us.i.posthog.com https://www.gstatic.com http://www.gstatic.com; worker-src 'self' blob: https://unpkg.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https: data:; font-src 'self' https: data:; img-src 'self' data: https: blob:; connect-src 'self' https: wss: ws: https://p.laminar.sh https://us.i.posthog.com https://github.com https://api.github.com; frame-src 'self' https://unpkg.com https://www.youtube-nocookie.com; media-src 'self' https://*.mux.com https://*.muxed.com blob:; object-src 'none'; form-action 'self' https://github.com; frame-ancestors 'none';",
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
    authToken: process.env.SENTRY_AUTH_TOKEN,

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
    webpack: {
      treeshake: {
        removeDebugLogging: true,
      },
    },
  });
} else {
  module.exports = nextConfig;
}
