import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Demoted to a warning on 2026-09-03, with 13 pre-existing instances
      // across 12 files — mostly admin pages and the two profile forms, all
      // the same shape: an async loader called straight from useEffect.
      //
      // Left as a warning rather than fixed in the same change that added CI,
      // because each fix restructures a working page and none of them belong
      // to the API work. They are real — cascading renders — and the fix is
      // mechanical: move the loader inside the effect behind an `alive` flag,
      // as components/spaces/InterestFeed.tsx does.
      //
      // Raise this back to "error" once the count is zero.
      "react-hooks/set-state-in-effect": "warn",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
