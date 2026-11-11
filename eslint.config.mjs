import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

export default defineConfig([
  globalIgnores([".keystone/**", ".next/**", "node_modules/**", "migrations/**"]),
  ...nextVitals,
  ...nextTypescript,
]);
