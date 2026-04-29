/** @type {import('tailwindcss').Config} */
module.exports = {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                primary: {
                    light: '#F6D1DD',
                    DEFAULT: '#F4C9D6',
                    dark: '#F2BFCB',
                },
                secondary: {
                    light: '#5A3F3A',
                    DEFAULT: '#3E2723',
                    dark: '#2D1C19',
                },
                cream: {
                    light: '#FDF5F8',
                    DEFAULT: '#FDF5F8',
                    dark: '#F9E8ED',
                },
            },
        },
    },
    plugins: [],
}