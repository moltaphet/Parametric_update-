/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // three.js ships untranspiled ESM in places; letting Next transpile it keeps
  // the production build portable across bundler versions.
  transpilePackages: ["three"],
};

export default nextConfig;
