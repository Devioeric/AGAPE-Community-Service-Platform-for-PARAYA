import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: "#6B5B3E",
          light: "#8B7A5E",
          dark: "#4A3F2B",
          foreground: "#FFFFFF",
        },
        accent: {
          DEFAULT: "#C4A96A",
          light: "#E8D5A8",
          foreground: "#2C2416",
        },
        surface: {
          DEFAULT: "#FFFFFF",
          alt: "#F5F0E8",
        },
        border: "#E5DDD0",
        background: "#FAFAF7",
        foreground: "#2C2416",
        muted: {
          DEFAULT: "#F5F0E8",
          foreground: "#6B6356",
        },
        card: {
          DEFAULT: "#FFFFFF",
          foreground: "#2C2416",
        },
        popover: {
          DEFAULT: "#FFFFFF",
          foreground: "#2C2416",
        },
        secondary: {
          DEFAULT: "#F5F0E8",
          foreground: "#2C2416",
        },
        destructive: {
          DEFAULT: "#9B3B3B",
          foreground: "#FFFFFF",
        },
        input: "#E5DDD0",
        ring: "#6B5B3E",
        success: "#4A7C59",
        warning: "#B8860B",
        danger: "#9B3B3B",
        info: "#5B7FA5",
        sdg: {
          "4": "#C5192D",
          "9": "#FD6925",
          "11": "#FD9D24",
          "17": "#19486A",
        },
        sidebar: {
          DEFAULT: "#F5F0E8",
          foreground: "#2C2416",
          primary: "#6B5B3E",
          "primary-foreground": "#FFFFFF",
          accent: "#E8D5A8",
          "accent-foreground": "#2C2416",
          border: "#E5DDD0",
          ring: "#6B5B3E",
        },
      },
      fontFamily: {
        sans: ["DM Sans", "sans-serif"],
        heading: ["Playfair Display", "serif"],
      },
      borderRadius: {
        lg: "0.5rem",
        md: "calc(0.5rem - 2px)",
        sm: "calc(0.5rem - 4px)",
        xl: "0.75rem",
        "2xl": "1rem",
      },
      boxShadow: {
        card: "0 2px 8px rgba(107,91,62,0.08)",
        "card-hover": "0 4px 16px rgba(107,91,62,0.14)",
        modal: "0 8px 32px rgba(107,91,62,0.16)",
      },
      keyframes: {
        "fade-in": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "slide-in": {
          "0%": { opacity: "0", transform: "translateX(-8px)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.3s ease-out",
        "slide-in": "slide-in 0.2s ease-out",
      },
    },
  },
  plugins: [],
};
export default config;
