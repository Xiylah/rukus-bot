import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Discord-ish palette so the dashboard feels at home next to the app.
        blurple: "#5865f2",
        panel: "#1e1f22",
        card: "#2b2d31",
        edge: "#3f4147",
      },
    },
  },
  plugins: [],
} satisfies Config;
