import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        figma: {
          bg: '#FFFFFF',
          sidebar: '#F5F5F5',
          border: '#E5E5E5',
          text: '#000000',
          'text-secondary': '#666666',
          'text-tertiary': '#999999',
          primary: '#18A0FB',
          'primary-hover': '#0D8FE8',
          danger: '#F24822',
          'danger-hover': '#E03C14',
          success: '#0FA958',
          panel: '#FCFCFC',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
export default config
