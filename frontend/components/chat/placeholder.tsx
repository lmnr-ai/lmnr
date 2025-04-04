import { motion } from "framer-motion";
import Image from "next/image";
import { User } from "next-auth";

import logo from "@/assets/logo/icon.svg";

const Placeholder = ({ user }: { user: User }) => (
  <motion.div
    key="overview"
    className="max-w-3xl mx-auto md:mt-20 my-auto"
    initial={{ opacity: 0, scale: 0.98 }}
    animate={{ opacity: 1, scale: 1 }}
    exit={{ opacity: 0, scale: 0.98 }}
    transition={{ delay: 0.5 }}
  >
    <div className="rounded-xl text-2xl md:text-4xl p-6 flex items-center leading-relaxed text-center max-w-xl">
      <Image className="mr-2 size-5 md:size-6" alt="logo" src={logo} />
      <p>Hello {user.name}</p>
    </div>
  </motion.div>
);

export default Placeholder;
