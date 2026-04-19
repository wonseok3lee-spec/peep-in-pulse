/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      fontFamily: {
        mono: [
          '"IBM Plex Mono"',
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "Consolas",
          "monospace",
        ],
      },
      colors: {
        canvas: "#F5F4F0",
        impact: "#EF4444",
        surprise: "#7C3AED",
        medium: "#F59E0B",
        gain: "#16A34A",
        loss: "#EF4444",
        accent: "#3B82F6",
      },
    },
  },
  plugins: [],
}

