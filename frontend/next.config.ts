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
  // LOCAL ONLY, DO NOT COMMIT: lets a teammate open this dev server over Tailscale.
  allowedDevOrigins: ["100.69.45.25"],
  deploymentId: process.env.NEXT_DEPLOYMENT_ID || undefined,
  env: {
    LAMINAR_CLOUD: process.env.LAMINAR_CLOUD,
  },
  reactStrictMode: false,
  logging: {
    fetches: {
      fullUrl: true,
    },
  },
  // Pi lazily imports node builtins by computed specifier, which bundling turns into unhandled rejections; chord is
  // external too so routes and pi-durable share one copy.
  serverExternalPackages: [
    "@lmnr-ai/lmnr",
    "@sentry/nextjs",
    "@earendil-works/chord",
    "@earendil-works/pi-ai",
    "@earendil-works/pi-durable",
  ],
  output: "standalone",
  // Policy markdown is read with fs at request time, which the standalone
  // file tracer can't see — without this the .md files are missing in the
  // production image and /policies/* 500s.
  outputFileTracingIncludes: {
    // Key is a minimatch glob over route names; "[slug]" would parse as a
    // character class, so match the whole segment with a wildcard.
    "/policies/*": ["./lib/policies/content/*.md"],
  },
  async rewrites() {
    // Forward LEGACY NextAuth callbacks whose ids differ from Better Auth's so
    // self-hosted Okta/Azure SSO keeps working with no IdP change (paired with the
    // pinned redirectURI in lib/auth.ts). `beforeFiles` to beat the `/api/auth/[...all]`
    // catch-all. Okta goes through the SSO plugin's shared callback, which reads the
    // provider from the OAuth state; keycloak already matches `/callback/:id`.
    return {
      beforeFiles: [
        { source: "/api/auth/callback/okta", destination: "/api/auth/sso/callback" },
        { source: "/api/auth/callback/azure-ad", destination: "/api/auth/callback/microsoft-entra-id" },
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

  // react-pdf's pdfjs reaches for the optional native `canvas` module: stub it out of the
  // browser bundle, keep it external on the server.
  webpack: (config, { isServer }) => {
    config.resolve.alias["canvas"] = false;

    if (isServer) {
      config.externals.push({
        canvas: "commonjs canvas",
      });
    }
    return config;
  },

  // Only `dev` runs Turbopack; `build` passes --webpack, so both bundler blocks are live.
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

    // Tree-shake Sentry logger statements to reduce bundle size.
    webpack: {
      treeshake: {
        removeDebugLogging: true,
      },
    },
    bundleSizeOptimizations: {
      excludeDebugStatements: true,
    },
  });
} else {
  module.exports = nextConfig;
}
