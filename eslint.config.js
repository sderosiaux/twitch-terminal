import js from "@eslint/js";
import globals from "globals";

export default [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "module",
      globals: {
        ...globals.node,
      },
    },
    rules: {
      // Strict error prevention
      "no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "no-undef": "error",
      "no-shadow": "error",
      "no-var": "error",
      "prefer-const": "error",
      "no-const-assign": "error",
      "no-duplicate-imports": "error",

      // Strict style
      "eqeqeq": ["error", "always"],
      "curly": ["error", "multi-line"],
      "no-throw-literal": "error",
      "no-else-return": "error",
      "no-lonely-if": "error",
      "no-unneeded-ternary": "error",
      "prefer-template": "error",
      "object-shorthand": "error",
      "prefer-arrow-callback": "error",
      "no-useless-return": "error",
      "no-useless-rename": "error",
      "no-useless-computed-key": "error",
      "no-useless-concat": "error",
      "no-useless-constructor": "error",

      // Strict safety
      "no-eval": "error",
      "no-implied-eval": "error",
      "no-new-func": "error",
      "no-param-reassign": ["error", { props: false }],
      "no-return-assign": "error",
      "no-self-compare": "error",
      "no-sequences": "error",
      "no-template-curly-in-string": "error",
      "no-use-before-define": ["error", { functions: false, classes: true }],
      "require-atomic-updates": "error",

      // Async
      "no-async-promise-executor": "error",
      "no-await-in-loop": "warn",
      "require-await": "error",
      "no-promise-executor-return": "error",
    },
  },
  // Extension source files — browser + Chrome extension globals
  {
    files: ["extension/terminal-src.js", "extension/background.js"],
    languageOptions: {
      globals: {
        ...globals.browser,
        chrome: "readonly",
      },
    },
  },
  // Extension build script
  {
    files: ["extension/build.js"],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
  // Ignore built output and dependencies
  {
    ignores: [
      "extension/terminal.js",
      "extension/terminal.js.map",
      "extension/xterm.css",
      "**/node_modules/**",
    ],
  },
];
