const path = require("path");
const isDevelopment = process.env.NODE_ENV === "development";

/** @type {import('next').NextConfig} */
const nextConfig = {
  distDir: isDevelopment ? ".next-dev" : ".next",
  outputFileTracingRoot: __dirname,
  turbopack: {
    root: __dirname
  },
  experimental: {
    devtoolSegmentExplorer: false
  }
};

module.exports = nextConfig;
