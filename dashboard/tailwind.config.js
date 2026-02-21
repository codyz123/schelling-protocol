/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Cluster colors from spec
        'cluster-matchmaking': '#F43F5E',
        'cluster-marketplace': '#F59E0B', 
        'cluster-talent': '#3B82F6',
        'cluster-roommates': '#10B981',
        'cluster-none': '#9CA3AF',
      }
    },
  },
  plugins: [],
}