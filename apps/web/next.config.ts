import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname_ = path.dirname(fileURLToPath(import.meta.url));

const config: NextConfig = {
  // Pin trace root to the workspace so a stray lockfile in $HOME doesn't confuse Next.
  outputFileTracingRoot: path.resolve(__dirname_, "../.."),
  experimental: {
    serverActions: { bodySizeLimit: "5mb" },
  },
  serverExternalPackages: ["better-sqlite3"],
  transpilePackages: ["@pookie/db", "@pookie/profile"],
  webpack(config) {
    config.resolve = config.resolve || {};
    // Resolve TS-style .js imports (e.g. "./client.js") to .ts source files in workspace packages.
    config.resolve.extensionAlias = {
      ...(config.resolve.extensionAlias || {}),
      ".js": [".ts", ".tsx", ".js"],
      ".mjs": [".mts", ".mjs"],
    };
    return config;
  },
};

export default config;
