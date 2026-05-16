/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "monospace"]
      },
      colors: {
        ink: "#0f172a",
        slateText: "#334155",
        mist: "#e2e8f0",
        panel: "#ffffff",
        accent: "#0f766e",
        accentSoft: "#ccfbf1"
      },
      boxShadow: {
        soft: "0 25px 70px -24px rgba(15, 23, 42, 0.28)"
      }
    }
  },
  plugins: []
}
