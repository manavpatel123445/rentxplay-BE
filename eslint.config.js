// Type-aware linting: bans `any` (written or inferred), unsafe casts and non-null assertions.
import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/**", "src/generated/**", "node_modules/**"] },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-non-null-assertion": "error",
      // `as` only where TypeScript can't know better (as const is always fine).
      "@typescript-eslint/consistent-type-assertions": ["error", { assertionStyle: "as", objectLiteralTypeAssertions: "never" }],
      // Express error handlers must declare 4 parameters even when the last ones are unused.
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/restrict-template-expressions": ["error", { allowNumber: true }],
      // Express 5 handles rejected promises from async handlers itself.
      "@typescript-eslint/no-misused-promises": ["error", { checksVoidReturn: { arguments: false } }],
    },
  },
  {
    files: ["*.config.js", "*.config.ts", "jest.config.js"],
    ...tseslint.configs.disableTypeChecked,
  },
);
