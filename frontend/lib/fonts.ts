import {
  Inter,
  Manrope,
  Space_Grotesk,
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
  weight: '600',
  style: 'normal',
  variable: '--font-manrope'
});

export const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  display: 'swap',
  style: 'normal',
  variable: '--font-space-grotesk'
});
