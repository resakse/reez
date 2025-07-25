/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      // This rule ensures that NextAuth's own API calls are NOT proxied.
      // It tells Next.js to handle them itself.
      {
        source: '/api/auth/:path*',
        destination: '/api/auth/:path*',
      },
      // This is the general rule. It proxies all OTHER /api/ calls to the Django backend.
      // This will work for /api/patients, /api/doctors, etc.
      {
        source: '/api/:path*',
        destination: 'http://127.0.0.1:8000/api/:path*',
      },
    ]
  },
};

export default nextConfig; 