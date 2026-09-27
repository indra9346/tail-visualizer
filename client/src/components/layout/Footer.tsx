import { Link } from "react-router-dom";

export function Footer() {
  return (
    <footer className="border-t border-stone-300/70 bg-[#fdfbf7]/85 backdrop-blur-md py-10">
      <div className="container-page flex flex-col items-center justify-between gap-4 text-sm text-stone-500 sm:flex-row">
        <div className="flex items-center gap-2.5">
          <img
            src="/images/logo/tiletry_logo.jpg"
            alt="TileTry Logo"
            className="h-7 w-7 rounded-md object-cover shadow-sm ring-1 ring-stone-900/10"
          />
          <span className="font-display text-base font-semibold text-stone-900">TileTry</span>
          <span className="text-xs text-stone-400">| The Virtual Trial Room for Your Home</span>
        </div>

        <div className="flex items-center gap-6 text-xs text-stone-600">
          <Link to="/demos" className="transition hover:text-stone-900">Live Demos</Link>
          <Link to="/tiles" className="transition hover:text-stone-900">Tile Catalog</Link>
          <Link to="/upload" className="transition hover:text-stone-900">Try Your Space</Link>
        </div>

        <span className="text-xs text-stone-400">&copy; {new Date().getFullYear()} TileTry. All rights reserved.</span>
      </div>
      <div className="container-page mt-5 border-t border-stone-100 pt-4 text-center text-[11px] text-stone-400">
        Realistic visualization preview. Actual lighting conditions, tile batch variations, and grout installation can affect physical finished results.
      </div>
    </footer>
  );
}
