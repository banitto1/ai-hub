import type { NextConfig } from "next";

// AI_HUB_DIST_DIR allows building/testing a separate copy without touching the .next used by the running hub.
const nextConfig: NextConfig = {distDir:process.env.AI_HUB_DIST_DIR||'.next',serverExternalPackages:['pdf-parse','mammoth','@lydell/node-pty','playwright'],outputFileTracingExcludes:{'*':['./.data/**/*','./win-app/**/*','./vendor/**/*','./android/**/*']}};

export default nextConfig;
