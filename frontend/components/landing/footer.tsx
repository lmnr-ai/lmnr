export default function Footer() {
  return (
    <div className="w-full flex flex-col md:justify-center md:items-center text-center text-lg">
      <div className="pl-8 flex flex-col items-start md:w-[1000px] space-y-4 pb-16 pt-32">
        <a className="" href="mailto:founders@lmnr.ai">Contact us</a>
        <a className="flex" target='_blank' href="https://discord.gg/nNFUUDAKub">Join Discord</a>
        <a target='_blank' href="https://docs.lmnr.ai/policies/privacy-policy">Privacy policy</a>
        <a target='_blank' href="https://docs.lmnr.ai/policies/terms-of-service">Terms of service</a>
        <a target='_blank' href="https://status.lmnr.ai">Status</a>
      </div>
    </div>
  );
}
