/** @type {import('next').NextConfig} */
const path = require('path');

const nextConfig = {
  reactStrictMode: false,
  logging: {
    fetches: {
      fullUrl: true,
    }
  },
  output: 'standalone',
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'avatars.githubusercontent.com',
        port: '',
        pathname: '/u/**',
      },
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
        port: '',
        pathname: '/a/**',
      },
    ],
  },

  webpack: (config, { isServer }) => {
    config.resolve.alias['canvas'] = false;

    if (isServer) {
      config.externals.push({
        'canvas': 'commonjs canvas'
      })
    }
    return config;
  },
  turbopack: {
    resolveExtensions: [
      '.ts',
      '.tsx',
      '.js',
      '.jsx',
      '.json',
      '.css',
      '.scss',
    ]
  },
};

module.exports = nextConfig;
