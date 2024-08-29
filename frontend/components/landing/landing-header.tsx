'use client';

import Link from "next/link";
import Image from 'next/image';
import logo from '@/assets/logo/laminar_light.svg';
import { useState } from 'react';
import { Menu, X, XCircle } from 'lucide-react';
import { Button } from "../ui/button";
import { cn } from "@/lib/utils";

interface LandingHeaderProps {
  hasSession: boolean;
}

export default function LandingHeader({ hasSession }: LandingHeaderProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuItemStyle = "text-sm md:text-base font-medium px-2 md:px-2 py-2 md:py-1 transition-colors w-full text-left  whitespace-nowrap md:rounded-sm hover:bg-secondary"

  return (
    <>
      <header className="flex flex-col md:flex-row w-full justify-between md:justify-center items-center fixed bg-background/30 backdrop-blur-lg z-50">
        <div className="w-full px-8 md:px-0 flex flex-col md:flex-row md:w-[1000px] justify-between items-center">
          <div className="flex justify-between w-full items-center h-20">
            <Link href="/">
              <Image alt='logo' src={logo} width={130} height={40} priority />
            </Link>
            <div className="md:hidden">
              {isMenuOpen ? (
                <X className="w-6 h-6 cursor-pointer" onClick={() => setIsMenuOpen(false)} />
              ) : (
                <Menu className="w-6 h-6 cursor-pointer" onClick={() => setIsMenuOpen(true)} />
              )}
            </div>
          </div>
          <nav className={cn("pb-8 md:p-0 w-full md:w-auto z-50 md:bg-transparent flex flex-col md:flex-row md:flex gap-2 items-start md:items-center md:h-20", isMenuOpen ? '' : 'hidden')}>
            <Link href="https://docs.lmnr.ai" className={menuItemStyle}>
              Docs
            </Link>
            <Link href="/pricing" className={menuItemStyle}>
              Pricing
            </Link>
            <Link target="_blank" href="https://cal.com/robert-lmnr/demo">
              <Button variant={"secondary"}>
                Talk to Founder
              </Button>
            </Link>
            <div className="hidden md:block">
              {hasSession ? (
                <Link href="/projects">
                  <Button>
                    Dashboard
                  </Button>
                </Link>
              ) : (
                <Link href="/sign-in">
                  <Button>
                    Sign up
                  </Button>
                </Link>
              )}
            </div>
          </nav>
        </div>
      </header>
    </>
  );
}
