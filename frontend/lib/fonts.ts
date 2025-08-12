import {
  Inter,
  Manrope,
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
  variable: '--font-manrope'
});