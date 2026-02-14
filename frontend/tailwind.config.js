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
        primary: '#1e293b',
        'primary-foreground': '#f8fafc',
        secondary: '#f1f5f9',
        'secondary-foreground': '#1e293b',
        muted: '#f1f5f9',
        'muted-foreground': '#64748b',
        accent: '#f1f5f9',
        'accent-foreground': '#1e293b',
        destructive: '#ef4444',
        'destructive-foreground': '#f8fafc',
        border: '#e2e8f0',
        input: '#e2e8f0',
        ring: '#1e293b',
      },
    },
  },
  plugins: [],
}
