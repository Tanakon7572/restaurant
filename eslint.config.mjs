import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    ".next-app/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // The Android project: Kotlin and Gradle, plus a copy of the web build
    // that bundle-web.sh drops into assets. Minified chunks are not source
    // and linting them buries the real findings.
    "android/**",
  ]),
]);

export default eslintConfig;
