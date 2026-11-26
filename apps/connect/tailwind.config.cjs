// Tailwind for Connect's standalone frontend (src/frontend), compiled at build time by scripts/build-frontend.js into
// one hashed stylesheet (QA fix plan PR F1, item S3). It replaces the Tailwind Play CDN and the inline
// `tailwind.config = {...}` that index.html carried until 2026-11-25. The Play CDN was Tailwind 3.4.17, so this is too
// (pinned exactly in package.json): the same utilities, the same preflight, the same colours.
//
// Tailwind only generates a class it can SEE in these files. Write class names whole ('bg-gold', never
// 'bg-' + tone): a name assembled at runtime would get no CSS. The Play CDN watched the live page and hid that mistake.
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/frontend/index.html", "./src/frontend/app/**/*.jsx", "./src/frontend/*.js"],
  theme: {
    extend: {
      colors: {
        background: "#F7F4EE",
        foreground: "#0A0908",
        card: "rgba(255,255,255,0.82)",
        "card-foreground": "#0A0908",
        popover: "rgba(255,255,255,0.97)",
        primary: "#0A0908",
        "primary-foreground": "#FFFFFF",
        secondary: "#F2BD22",
        "secondary-foreground": "#0A0908",
        muted: "#EDE8DC",
        "muted-foreground": "#7A7060",
        accent: "#FBF1CC",
        "accent-foreground": "#0A0908",
        border: "rgba(242,189,34,0.22)",
        destructive: "#c0392b",
        gold: "#F2BD22",
        "gold-light": "#FCDD6C",
        "gold-dark": "#836100",
      },
      fontFamily: {
        sans: ["Plus Jakarta Sans", "ui-sans-serif", "sans-serif"],
        // Headings are Manrope and body text Plus Jakarta Sans (founder, 2026-11-26: Playfair dropped). `serif` stays a
        // name so old classes keep working; it is the heading face now.
        serif: ["Manrope", "Plus Jakarta Sans", "ui-sans-serif", "sans-serif"],
        brand: ["Manrope", "ui-sans-serif", "sans-serif"],
      },
    },
  },
};
