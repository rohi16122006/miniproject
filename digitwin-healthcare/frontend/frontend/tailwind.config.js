/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        paper: "#F8FAFC",
        ink: "#0F172A",
        rule: "#E2E8F0",
        mute: "#64748B",
        base: "#94A3B8",
        twin: "#0D9488",
        alert: "#E11D48",
        clinical: {
          teal: "#0D9488",
          darkTeal: "#0F766E",
          cyan: "#0284C7",
          navy: "#0F172A",
          slate: "#1E293B",
          rose: "#E11D48",
          blue: "#2563EB",
          indigo: "#6366F1",
          emerald: "#10B981",
          amber: "#F59E0B"
        }
      },
      fontFamily: {
        sans: ["Inter", "-apple-system", "BlinkMacSystemFont", "'Segoe UI'", "Roboto", "Helvetica", "Arial", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
      },
      boxShadow: {
        glow: "0 0 20px -5px rgba(13, 148, 136, 0.3)",
        card: "0 1px 3px 0 rgba(0, 0, 0, 0.05), 0 1px 2px -1px rgba(0, 0, 0, 0.05)",
        clinical: "0 4px 6px -1px rgba(15, 23, 42, 0.06), 0 2px 4px -2px rgba(15, 23, 42, 0.04)"
      }
    }
  },
  plugins: [],
};
