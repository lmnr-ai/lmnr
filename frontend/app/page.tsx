import { authOptions } from "@/lib/auth";
import { getServerSession } from "next-auth";
import { Metadata } from 'next'
import { redirect } from "next/navigation";


export const metadata: Metadata = {
  title: 'Laminar',
  openGraph: {
    type: 'website',
    title: 'Laminar',
    description: 'Orchestration engine for LLM agents',
  },
  twitter: {
    card: 'summary',
    description: 'The LLM engineering platform',
    title: 'Laminar',
    images: {
      url: 'https://www.lmnr.ai/twitter-image.png',
      alt: 'Logo of Laminar - Orchestration engine for LLM agents',
    },
  }
}

export default async function LandingPage() {

  const session = await getServerSession(authOptions);
  redirect(session ? '/projects' : '/sign-in');
}
