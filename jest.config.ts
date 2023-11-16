export default {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/test/**/*.test.ts'],
  testTimeout: 120000, // 10000 ms = 10 seconds
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: '<rootDir>/test/tsconfig.test.json',
      },
    ],
  },
};
