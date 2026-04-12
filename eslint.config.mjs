import nextVitals from "eslint-config-next/core-web-vitals";

const eslintConfig = [
  ...nextVitals,
  {
    ignores: [".next/**", "node_modules/**", "contracts/out/**", "contracts/cache/**", "contracts/broadcast/**"]
  }
];

export default eslintConfig;
