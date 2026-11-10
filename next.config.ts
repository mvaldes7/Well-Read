import type { NextConfig } from "next";
import { nextRedirects } from "./src/content/topic-redirects.mjs";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // Don't let `next dev` write AGENTS.md into the repo; agent rules live in /workspace/agents.
  agentRules: false,
  redirects: async () => nextRedirects(),
};

export default nextConfig;
