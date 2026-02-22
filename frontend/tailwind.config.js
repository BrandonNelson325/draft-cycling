/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: '#ffffff',
        foreground: '#0f172a',
        card: '#ffffff',
        'card-foreground': '#0f172a',
        primary: '#22c55e', // Green primary color
        'primary-foreground': '#ffffff',
        secondary: '#f1f5f9',
        'secondary-foreground': '#1e293b',
        muted: '#f8fafc',
        'muted-foreground': '#64748b',
        accent: '#f1f5f9',
        'accent-foreground': '#1e293b',
        destructive: '#ef4444',
        'destructive-foreground': '#f8fafc',
        border: '#e5e7eb',
        input: '#e5e7eb',
        ring: '#22c55e',
        // Logo green shades
        'green-dark': '#22c55e',
        'green-medium': '#4ade80',
        'green-light': '#86efac',
        'green-lighter': '#bbf7d0',
      },
    },
  },
  plugins: [],
}
