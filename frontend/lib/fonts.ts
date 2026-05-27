import { Inter, Manrope } from "next/font/google";
import localFont from "next/font/local";

export const sansLanding = localFont({
  src: [
    { path: "./fonts/general/GeneralSans-Variable.woff2", weight: "200 700", style: "normal" },
    { path: "./fonts/general/GeneralSans-VariableItalic.woff2", weight: "200 700", style: "italic" },
  ],
  display: "swap",
  variable: "--font-general-sans",
});

export const sans = Inter({
  subsets: ["latin"],
  display: "swap",
  style: "normal",
  variable: "--font-inter",
});

export const manrope = Manrope({
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600", "700"],
  style: "normal",
  variable: "--font-manrope",
});
