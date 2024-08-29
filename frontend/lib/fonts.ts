import { JetBrains_Mono as FontMono, Inter as FontSans } from 'next/font/google'
import localFont from 'next/font/local'

export const fontSans = FontSans({
  subsets: ['latin'],
  variable: '--font-sans'
})

export const fontMono = FontMono({
  subsets: ['latin'],
  variable: '--font-mono'
})

export const fontSecurity = localFont({
  src: '../assets/fonts/text-security-disc.woff2',
  weight: '500',
  style: 'normal',
})
