import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Pin workspace root when a lockfile exists above this app (avoids wrong Turbopack root in dev). */
/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: {
    root: __dirname,
  },
  /**
   * Canonical production host: `vault.bouldermetalsmiths.com`.
   * Keep the old hostname attached to this Vercel project so requests hit the app; this rule 301s to the new host (path + query preserved by the platform).
   */
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "vault.bearsilverandstone.com" }],
        destination: "https://vault.bouldermetalsmiths.com/:path*",
        permanent: true,
      },
      // Safari often requests /favicon.ico; map to the app icon route so bookmarks/tabs pick up the current mark.
      {
        source: "/favicon.ico",
        destination: "/icon.png",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
