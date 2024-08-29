'use client';

import { Button } from "@/components/ui/button";
import Footer from "@/components/landing/footer";
import PricingCard from "./pricing-card";
import Link from "next/link";

export default function Pricing() {
  return (
    <div className="flex flex-col items-center mt-32 w-full h-full">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 gap-8 md:p-16">
        <div className="p-8 border rounded flex flex-col space-y-4">
          <PricingCard
            className="text-secondary-foreground"
            title="Starter"
            description=""
            price="0 / month"
            features={[
              "1 workspace",
              "1 project",
              "50K spans / month",
              "1K events / month",
              "7 day trace retention",
              "1 team member",
            ]}
          />
          <Link href="/projects">
            <Button variant="secondary" className="w-full">
              Get started
            </Button>
          </Link>
        </div>
        <div className="bg-gradient-to-br from-white via-primary to-gray-500 rounded" style={{ padding: '1px' }}>
          <div className="bg-background h-full w-full rounded p-8 flex flex-col space-y-4">
            <PricingCard
              title="Pro"
              description="Perfect for small teams"
              price="$100 / month"
              features={[
                "1 workspace",
                "5 projects",
                "100k spans / month",
                "50k events / month",
                "30 day trace retention",
                "3 team members",
              ]}
              subfeatures={[
                null, null, "$10 / 100k for additional spans", "$10 / 50k for additional events", null, "$20 / month for each additional member"
              ]}
            />
            {/* <div className="text-secondary-foreground">$20 / month for each additional member</div> */}
            <Link href="/projects">
              <Button variant="secondary" className="w-full">
                Get started
              </Button>
            </Link>
          </div>
        </div>
        {/* <div className="p-8 border-2 rounded flex flex-col space-y-4">
          <PricingCard
            className="text-secondary-foreground"
            title="Enterprise"
            description="Build cutting-edge products on Laminar"
            price="Custom"
            features={[
              "Custom",
              "10 projects / workspace",
              "1M pipeline runs / month",
              "1000MB storage",
              "90 day log retention",
              "5 members per workspace",
            ]}
          />
          <div className="text-secondary-foreground">$20 / month for each additional member</div>
          <a target="_blank" href="https://cal.com/skull8888888/30min">
            <Button variant="secondary" className="w-full">
              Book a demo
            </Button>
          </a>
        </div> */}
        {/* <div className="p-8 border-2 rounded flex flex-col space-y-4 flex-1">
          <PricingCard
            title="Enterprise"
            description="Perfect for large-scale businesses"
            price="Custom"
            features={[
              "Unlimited workspaces",
              "Unlimited projects",
              "Unlimited pipeline runs / month",
              "Configurable storage size",
              "Configurable number of collaborators",
              "Configurable log retention period",
              "Unlimited code generations per month",
            ]} />
          <Button variant={'secondary'} className="w-full">
            Contact us
          </Button>
        </div> */}
      </div>
      <div className="flex-grow"></div>
      <Footer />
    </div >
  );
}
