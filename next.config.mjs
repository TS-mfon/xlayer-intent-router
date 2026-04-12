/** @type {import('next').NextConfig} */
const nextConfig = {
  typedRoutes: false,
  turbopack: {
    root: import.meta.dirname
  }
};

export default nextConfig;
