/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#212121",
        muted: "#666666",
        line: "#e6e6e6",
        blush: "#faeff1",
        anteraja: "#bd005f",
        "anteraja-dark": "#98004d",
        success: "#087f5b",
        warning: "#9a6700",
        danger: "#b42318",
      },
      fontFamily: { sans: ["Open Sans", "sans-serif"] },
      boxShadow: { panel: "0 10px 32px rgba(33, 33, 33, 0.06)" },
    },
  },
  plugins: [],
};
