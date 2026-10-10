/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack(config, { webpack }) {
    config.resolve.alias.paper = require.resolve('paper/dist/paper-core.js')
    // Paper's browser bundle guards these Node-only imports with `self` checks.
    // Exclude optional jsdom/canvas adapters from static Webpack resolution.
    config.plugins.push(
      new webpack.IgnorePlugin({
        resourceRegExp: /^\.\/node\/(self|extend)\.js$/,
        contextRegExp: /paper[\\/]dist$/,
      }),
    )
    return config
  },
}

module.exports = nextConfig
