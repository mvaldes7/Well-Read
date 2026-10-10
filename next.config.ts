import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // Don't let `next dev` write AGENTS.md into the repo; agent rules live in /workspace/agents.
  agentRules: false,
};

export default nextConfig;
