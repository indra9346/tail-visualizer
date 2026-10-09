import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { SwanCredit } from "@/components/layout/SwanCredit";
import { SDSLogo } from "@/components/ui/SDSLogo";

export function Footer() {
  return (
    <motion.footer
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="relative z-10 border-t border-stone-300/70 bg-[#FAF9F5]/85 backdrop-blur-md py-10"
    >
      <div className="container-page flex flex-col items-center justify-between gap-4 text-sm text-stone-500 sm:flex-row">
        <div className="flex items-center gap-3">
          <SDSLogo size="sm" variant="dark" subtitle="Virtual Trial Room" />
        </div>

        <div className="flex items-center gap-6 text-xs text-stone-600">
          <Link to="/demos" className="transition hover:text-stone-900">Demos</Link>
          <Link to="/tiles" className="transition hover:text-stone-900">Catalog</Link>
          <Link to="/my-visualizations" className="transition hover:text-stone-900">Designs</Link>
          <Link to="/upload" className="transition hover:text-stone-900">Visualize</Link>
        </div>

        <span className="text-xs text-stone-400">&copy; {new Date().getFullYear()} SDS TILES & CERAMICS. All rights reserved.</span>
      </div>
      <div className="container-page mt-5 border-t border-stone-100 pt-4 text-center text-[11px] text-stone-400">
        Realistic visualization preview. Actual lighting conditions, tile batch variations, and grout installation can affect physical finished results.
      </div>
      <div className="container-page"><SwanCredit /></div>
    </motion.footer>
  );
}
