/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        // The package builds as ESM/Bundler; compile tests to CommonJS for jest.
        tsconfig: { module: 'commonjs', moduleResolution: 'node', types: ['jest', 'node'], esModuleInterop: true },
      },
    ],
  },
};
