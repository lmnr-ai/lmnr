import eslint from "@eslint/js";
import nextPlugin from "@next/eslint-plugin-next";
import prettierConfig from "eslint-config-prettier";
import reactHooksPlugin from "eslint-plugin-react-hooks";
import simpleImportSort from "eslint-plugin-simple-import-sort";
import unusedImports from "eslint-plugin-unused-imports";
import tseslint from "typescript-eslint";

// Plugins
const defaultPlugins = {
  "unused-imports": unusedImports,
  "simple-import-sort": simpleImportSort,
};

const nextPlugins = {
  "@next/next": nextPlugin,
  "react-hooks": reactHooksPlugin,
};

// Rules
const eslintRulesCommon = {
  "arrow-body-style": ["warn", "as-needed"],
  "no-duplicate-imports": "error",
  "no-console": "warn",
};

const eslintRulesImports = {
  "unused-imports/no-unused-imports": "error",
  "simple-import-sort/imports": "error",
  "simple-import-sort/exports": "error",
};

const eslintRulesTs = {
  "@typescript-eslint/no-explicit-any": "warn",
  "@typescript-eslint/no-unused-vars": [
    "warn",
    {
      argsIgnorePattern: "^_",
      varsIgnorePattern: "^_",
    },
  ],
  "@typescript-eslint/consistent-type-imports": [
    "warn",
    {
      prefer: "type-imports",
      fixStyle: "inline-type-imports",
    },
  ],
};

const eslintRulesNext = {
  ...nextPlugin.configs.recommended.rules,
  ...nextPlugin.configs["core-web-vitals"].rules,
};

const eslintRulesReact = {
  ...reactHooksPlugin.configs.recommended.rules,
};

// Language Options
const languageOptionsCommonJs = {
  globals: {
    module: "readonly",
    require: "readonly",
  },
};

// Config
export default tseslint.config(
  // Global ignores
  {
    ignores: [".next/**", "node_modules/**", "next-env.d.ts", "lib/db/migrations/**"],
  },

  // Base configs - order matters (cascading)
  eslint.configs.recommended,
  ...tseslint.configs.recommended,

  // TS and TSX files
  {
    files: ["**/*.ts", "**/*.tsx"],
    plugins: { ...defaultPlugins, ...nextPlugins },
    rules: {
      ...eslintRulesCommon,
      ...eslintRulesImports,
      ...eslintRulesTs,
      ...eslintRulesNext,
      ...eslintRulesReact,
    },
  },

  // JS and MJS files
  {
    files: ["**/*.js", "**/*.mjs"],
    plugins: { ...defaultPlugins },
    languageOptions: languageOptionsCommonJs,
    rules: {
      ...eslintRulesCommon,
      ...eslintRulesImports,
    },
  },

  // Config files - allow require imports
  {
    files: ["*.config.ts", "*.config.js", "instrumentation.ts"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },

  // API routes and webhooks - allow console for debugging
  {
    files: ["app/api/**/*.ts", "app/webhook/**/*.ts"],
    rules: {
      "no-console": "off",
    },
  },
  prettierConfig
);
