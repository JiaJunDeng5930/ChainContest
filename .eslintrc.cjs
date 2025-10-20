const path = require("path");

/** @type {import("eslint").Linter.Config} */
module.exports = {
  root: true,
  ignorePatterns: [
    "dist",
    "build",
    "coverage",
    "artifacts",
    "cache",
    "node_modules",
  ],
  env: {
    es2021: true,
  },
  overrides: [
    {
      files: ["**/*.ts", "**/*.tsx"],
      parser: "@typescript-eslint/parser",
      parserOptions: {
        project: [
          path.join(__dirname, "contracts/tsconfig.json"),
          path.join(__dirname, "apps/dev-console/tsconfig.json"),
          path.join(__dirname, "apps/api-server/tsconfig.json"),
        ],
        tsconfigRootDir: __dirname,
        ecmaVersion: "latest",
        sourceType: "module",
      },
      plugins: ["@typescript-eslint"],
      extends: [
        "eslint:recommended",
        "plugin:@typescript-eslint/recommended",
        "plugin:@typescript-eslint/recommended-requiring-type-checking",
      ],
      rules: {
        "@typescript-eslint/no-misused-promises": [
          "error",
          {
            checksVoidReturn: {
              attributes: false,
            },
          },
        ],
        "@typescript-eslint/explicit-function-return-type": "off",
        "@typescript-eslint/no-floating-promises": [
          "error",
          {
            ignoreVoid: true,
          },
        ],
      },
    },
    {
      files: ["apps/dev-console/**/*.{ts,tsx}", "apps/dev-console/**/*.test.{ts,tsx}"],
      env: {
        browser: true,
      },
      extends: ["plugin:react-hooks/recommended", "plugin:react/recommended"],
      settings: {
        react: {
          version: "detect",
        },
      },
      rules: {
        "react/react-in-jsx-scope": "off",
      },
    },
    {
      files: ["contracts/**/*.ts"],
      env: {
        node: true,
      },
    },
  ],
};
