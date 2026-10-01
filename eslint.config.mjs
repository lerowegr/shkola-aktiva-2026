// @ts-check
import withNuxt from "./.nuxt/eslint.config.mjs";

export default withNuxt({
  // В .claude лежат установленные скиллы — чужой код, который мы не правим.
  ignores: [".claude/**", "lib/generated/**", "public/**"],
});
