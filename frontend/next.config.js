/**
 * next.config.js
 *
 * The headers below are the ones a static-hosted front end can set for itself.
 * The API's own headers come from helmet in the Express app; these cover the
 * documents the browser loads from this origin.
 *
 * There is deliberately no Content-Security-Policy here yet: this app loads
 * Monaco from a CDN and Tailwind injects styles, so a policy written blind
 * would either break the editor or be loose enough to be theatre. See
 * docs/phase15.md for what a real policy needs before it is switched on.
 */

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Do not advertise the framework version to every visitor.
  poweredByHeader: false,

  experimental: {
    serverComponentsExternalPackages: ["pdf-parse", "mammoth"],
  },

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // Never let a browser guess a type it was not given.
          { key: "X-Content-Type-Options", value: "nosniff" },
          // This app is never meant to be framed; clickjacking has no use case here.
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Nothing in this product needs a camera, a microphone or a location.
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
          // Only meaningful over https; harmless on a local http dev server
          // because browsers ignore it there.
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
        ],
      },
      {
        // The legacy route handlers return per-account data. Nothing about them
        // may be cached by a CDN or a shared proxy.
        source: "/api/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store, no-cache, must-revalidate" },
          { key: "Vary", value: "Authorization" },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
