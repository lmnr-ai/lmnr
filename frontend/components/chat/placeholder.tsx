import { motion } from "framer-motion";
import { User } from "next-auth";

const Placeholder = ({ user }: { user: User }) => (
  <motion.div
    key="overview"
    className="max-w-3xl mx-auto md:mt-20 my-auto"
    initial={{ opacity: 0, scale: 0.98 }}
    animate={{ opacity: 1, scale: 1 }}
    exit={{ opacity: 0, scale: 0.98 }}
    transition={{ delay: 0.5 }}
  >
    <div className="rounded-xl text-3xl p-6 flex flex-col leading-relaxed text-center max-w-xl">
      <p>Hello {user.name}</p>
    </div>
  </motion.div>
);

export default Placeholder;
