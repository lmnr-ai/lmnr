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
    <div className="md:text-4xl p-6 flex items-center leading-relaxed text-center flex-col">
      <p className="font-medium">Index</p>
    </div>
  </motion.div>
);

export default Placeholder;
