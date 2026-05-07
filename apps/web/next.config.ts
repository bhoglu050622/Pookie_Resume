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
};

export default config;
