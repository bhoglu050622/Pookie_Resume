import type { NextConfig } from "next";

const config: NextConfig = {
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
