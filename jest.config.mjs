/** @type {import('jest').Config} */
export default {
  testEnvironment: "node",
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },
  transform: {
    "^.+\\.ts$": [
      "ts-jest",
      {
        tsconfig: {
          module: "commonjs",
          target: "es2020",
          moduleResolution: "node",
          esModuleInterop: true,
          strict: true,
        },
      },
    ],
  },
  testMatch: ["**/test/**/*.test.ts"],
};
