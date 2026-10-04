/** @type {import("prettier").Config & import("prettier-plugin-tailwindcss").PluginOptions} */
const config = {
  plugins: ["prettier-plugin-tailwindcss"],
  tailwindStylesheet: "./app/(link)/link.css",
  // Sort classes passed through cn() too (§ Styling: composition goes through cn()).
  tailwindFunctions: ["cn"],
};

export default config;
