import {
  Inter,
  Manrope,
  Space_Grotesk,
  Chivo_Mono,
} from 'next/font/google';

export const sans = Inter({
  subsets: ['latin'],
  display: 'swap',
  style: 'normal',
  variable: '--font-inter'
});

export const manrope = Manrope({
  subsets: ['latin'],
  display: 'swap',
  style: 'normal',
  variable: '--font-title'
});

export const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  display: 'swap',
  style: 'normal',
  variable: '--font-space-grotesk'
});

export const chivoMono = Chivo_Mono({
  subsets: ['latin'],
  display: 'swap',
  style: 'normal',
  variable: '--font-chivo-mono'
});
