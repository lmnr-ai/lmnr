'use client';

import { Menu, X } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';
import GitHubButton from 'react-github-btn';

import logo from '@/assets/logo/logo.svg';
import { cn } from '@/lib/utils';

import { Button } from '../ui/button';

interface LandingHeaderProps {
  hasSession: boolean;
}

export default function LandingHeader({ hasSession }: LandingHeaderProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <>
      <header className="flex flex-col md:flex-row w-full justify-between md:justify-center items-center fixed z-50 backdrop-blur-lg">
        <div className="w-full px-8 md:px-0 flex flex-col md:flex-row md:w-[1200px] justify-between">
          <div className="flex items-center h-20 justify-between">
            <Link href="/" className="-mt-1">
              <Image alt="logo" src={logo} width={150} priority />
            </Link>
            <div className="md:hidden">
              {isMenuOpen ? (
                <X
                  className="w-6 h-6 cursor-pointer"
                  onClick={() => setIsMenuOpen(false)}
                />
              ) : (
                <Menu
                  className="w-6 h-6 cursor-pointer"
                  onClick={() => setIsMenuOpen(true)}
                />
              )}
            </div>
          </div>
          <nav
            className={cn(
              'pb-8 md:p-0 w-full md:w-auto z-50 flex flex-col md:flex-row md:flex gap-2 items-center md:h-20',
              isMenuOpen ? '' : 'hidden'
            )}
          >
            <Link href="/chat" target="_blank">
              <Button variant="ghost">
                Index - Browser Agent
              </Button>
            </Link>
            <Link href="https://docs.lmnr.ai" target="_blank">
              <Button variant="ghost">
                Docs
              </Button>
            </Link>
            <Link href="/pricing">
              <Button variant="ghost">Pricing</Button>
            </Link>
            <Link href="/blog">
              <Button variant="ghost">Blog</Button>
            </Link>
            <Link target="_blank" href="https://discord.gg/nNFUUDAKub">
              <Button variant="ghost">Discord</Button>
            </Link>
            <GitHubButton href="https://github.com/lmnr-ai/lmnr" data-color-scheme="no-preference: dark; light: dark; dark: dark;" data-size="large" data-show-count="true" aria-label="Star lmnr-ai/lmnr on GitHub">Star</GitHubButton>
            {/* <Link target="_blank" href="https://cal.com/robert-lmnr/demo">
              <Button
                variant={'outline'}
                className="bg-transparent border-white/60 hover:bg-white/10"
              >
                Book a demo
              </Button>
            </Link> */}
            <div className="hidden md:block">
              {hasSession ? (
                <Link href="/projects">
                  <Button>Dashboard</Button>
                </Link>
              ) : (
                <Link href="/sign-in">
                  <Button>Sign up</Button>
                </Link>
              )}
            </div>
          </nav>
        </div>
      </header>
    </>
  );
}
