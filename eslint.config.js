const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: [
      '.expo/**',
      'coverage/**',
      'node_modules/**',
      'outputs/**',
      'work/**',
    ],
  },
]);
