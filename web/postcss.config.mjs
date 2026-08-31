// Tailwind v4 is configured CSS-first (see src/app/globals.css); the PostCSS
// plugin is the only build-time wiring required.
const config = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};

export default config;
