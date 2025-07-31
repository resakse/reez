import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Removed rewrites since we're using direct API calls with CORS
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // Tell Webpack to ignore Node.js modules in client-side code
      config.resolve.fallback = {
        fs: false,
        path: false,
        crypto: false,
        stream: false,
        util: false,
        buffer: false,
        assert: false,
        url: false,
        querystring: false,
        zlib: false,
        http: false,
        https: false,
        net: false,
        tls: false,
        os: false,
        string_decoder: false,
        events: false,
        punycode: false,
      };
      
      // Exclude the problematic JPEG 2000 codec from the bundle
      config.resolve.alias = {
        ...config.resolve.alias,
        '@cornerstonejs/codec-openjph': false,
      };
      
      // Use null-loader to exclude the codec
      config.module.rules.push({
        test: /node_modules[\/\\]@cornerstonejs[\/\\]codec-openjph/,
        use: 'null-loader',
      });
    }
    
    // Handle worker files properly
    config.module.rules.push({
      test: /\.worker\.js$/,
      use: { loader: 'worker-loader' },
    });
    
    return config;
  },
};

export default nextConfig;
