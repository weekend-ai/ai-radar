/** @type {import('next').NextConfig} */
const nextConfig = {
  // Standalone output bundles minimal node_modules + a server.js for production.
  // Required for the slim k8s image — see Dockerfile.
  output: "standalone",
  experimental: {
    typedRoutes: true,
  },
  serverExternalPackages: ["postgres"],
};

export default nextConfig;
