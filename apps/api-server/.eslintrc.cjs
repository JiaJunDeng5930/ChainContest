const path = require("path");

/** @type {import("eslint").Linter.Config} */
module.exports = {
  extends: ["../../.eslintrc.cjs", "next/core-web-vitals"],
  parserOptions: {
    project: [path.join(__dirname, "tsconfig.json")],
    tsconfigRootDir: __dirname
  },
  env: {
    node: true
  },
  settings: {
    next: {
      rootDir: __dirname
    }
  }
};
