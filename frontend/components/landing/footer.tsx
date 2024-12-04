import Image from 'next/image';

import noise from '@/assets/landing/noise2.jpeg';

export default function Footer() {
  return (
    <div className="w-full flex flex-col md:justify-center md:items-center text-center text-lg">
      <div className="relative md:w-[1200px] overflow-hidden md:rounded-lg md:mb-16">
        <div className="inset-0 absolute z-10 overflow-hidden">
          <Image src={noise} alt="" className="w-full h-full object-cover object-top" />
        </div>
        <div className="relative z-20">
          <div className="pl-8 flex flex-col items-start md:w-[1000px] space-y-4 py-16 font-medium">
            <a className="" href="mailto:founders@lmnr.ai">
              Contact us
            </a>
            <a target="_blank" href="https://github.com/lmnr-ai/lmnr">
              GitHub
            </a>
            <a
              className="flex"
              target="_blank"
              href="https://discord.gg/nNFUUDAKub"
            >
              Join Discord
            </a>
            <a target="_blank" href="https://docs.lmnr.ai/policies/privacy-policy">
              Privacy policy
            </a>
            <a
              target="_blank"
              href="https://docs.lmnr.ai/policies/terms-of-service"
            >
              Terms of service
            </a>
            <a target="_blank" href="https://status.lmnr.ai">
              Status
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
