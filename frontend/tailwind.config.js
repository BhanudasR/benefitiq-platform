/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Premium light enterprise tokens (match approved demo direction)
        canvas: "#F4F7FB",
        card: "#FFFFFF",
        line: "#E2E8F0",
        ink: "#0F172A",
        muted: "#64748B",
        brand: "#2563EB",
        brandSoft: "#EFF4FF",
        good: "#16A34A",
        warn: "#D97706",
        bad: "#DC2626",
      },
      boxShadow: { card: "0 1px 2px rgba(15,23,42,0.04), 0 4px 16px rgba(15,23,42,0.06)" },
      borderRadius: { xl2: "14px" },
    },
  },
  plugins: [],
};
