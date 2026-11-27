// Jest runs the TypeScript sources as native ES modules (like Node does in dev), transformed by SWC.
// The `test` script starts Node with --experimental-vm-modules, which Jest's ESM support needs.
/** @type {import("jest").Config} */
export default {
  testEnvironment: "node",
  testMatch: ["<rootDir>/src/**/*.test.ts"],
  extensionsToTreatAsEsm: [".ts"],
  transform: {
    "^.+\\.ts$": [
      "@swc/jest",
      {
        jsc: { parser: { syntax: "typescript" }, target: "es2023" },
        module: { type: "es6" },
      },
    ],
  },
  // Each test file shares one database, so run files one at a time.
  maxWorkers: 1,
};
