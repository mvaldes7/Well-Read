import type { NextConfig } from "next";
import { nextRedirects } from "./src/content/topic-redirects.mjs";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // Stops `next dev` from autogenerating AGENTS.md; the checked-in AGENTS.md is a hand-written pointer.
  // Repo rules for contributors and AI tools live in instructions.md (AGENTS.md and CLAUDE.md point to it).
  agentRules: false,
  redirects: async () => nextRedirects(),
};

export default nextConfig;
