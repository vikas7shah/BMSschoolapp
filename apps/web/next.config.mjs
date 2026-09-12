/** @type {import('next').NextConfig} */
const nextConfig = {
  // Exported as static files behind CloudFront; the API is a separate Lambda
  // reachable at /api on the same origin.
  output: 'export',
  trailingSlash: true,
  images: { unoptimized: true },
  reactStrictMode: true,
  transpilePackages: ['@bms/shared'],
};

export default nextConfig;
