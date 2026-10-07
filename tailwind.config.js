/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          pink: "#FF5FA2",
          magenta: "#EC4899",
          purple: "#A855F7",
          deep: "#3B0764",
          ink: "#4C1D95",
          money: "#22C55E",
          gold: "#F59E0B",
          sky: "#38BDF8",
        },
      },
      borderRadius: { xl2: "1.25rem" },
    },
  },
  plugins: [],
};
