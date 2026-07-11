/** @type {import('next').NextConfig} */
const nextConfig = {
  // These TS-source workspace packages must be compiled by Next.
  transpilePackages: ["@rukus/supabase", "@rukus/shared"],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "cdn.discordapp.com" },
    ],
  },
  webpack: (config) => {
    // The @rukus/supabase and @rukus/shared packages are TS source that uses
    // explicit ".js" import specifiers (NodeNext ESM style). Teach webpack to
    // resolve those specifiers to the ".ts"/".tsx" source so Next can compile
    // the workspace packages directly.
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js"],
      ".mjs": [".mts", ".mjs"],
    };
    return config;
  },
};

export default nextConfig;
