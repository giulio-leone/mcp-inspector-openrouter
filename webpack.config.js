/* eslint-disable @typescript-eslint/no-require-imports */
const path = require('path');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const { CleanWebpackPlugin } = require('clean-webpack-plugin');

const isProd = process.env.NODE_ENV === 'production';

module.exports = {
  mode: isProd ? 'production' : 'development',
  devtool: isProd ? 'hidden-source-map' : 'source-map',

  entry: {
    background: './src/background/index.ts',
    content: './src/content/index.ts',
    sidebar: './src/sidebar/index.ts',
    options: './src/options/index.ts',
  },

  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].js',
    chunkFilename: 'chunk-[id].js',
    clean: true,
  },

  resolve: {
    extensions: ['.ts', '.js'],
    alias: {
      '@ai-sdk/openai': false,
      '@ai-sdk/anthropic': false,
      '@ai-sdk/google': false,
      '@ai-sdk/groq': false,
      '@ai-sdk/mistral': false,
      '@giulio-leone/gaussflow-vectorless': false,
      'onecrawl': path.resolve(__dirname, 'node_modules/onecrawl'),
      'playwright': false,
      'undici': false,
    },
    fallback: {
      "path": false,
      "os": false,
      "fs": false,
      "crypto": false,
      "stream": false,
      "http": false,
      "https": false,
      "zlib": false,
      "url": false,
      "assert": false,
      "tls": false,
      "net": false,
      "child_process": false,
    }
  },

  module: {
    rules: [
      {
        test: /\.ts$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
    ],
  },

  optimization: {
    splitChunks: false,
    runtimeChunk: false,
  },

  plugins: [
    new CleanWebpackPlugin(),
    new CopyWebpackPlugin({
      patterns: [
        { from: 'src/manifest.json', to: 'manifest.json' },
        { from: 'src/sidebar.html', to: 'sidebar.html' },
        { from: 'src/styles.css', to: 'styles.css' },
        { from: 'src/styles/', to: 'styles/' },
        { from: 'src/options.html', to: 'options.html' },
      ],
    }),
  ],
};
