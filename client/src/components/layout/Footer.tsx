import { Link } from "react-router-dom";

export function Footer() {
  return (
    <footer className="border-t border-stone-200 bg-white py-10">
      <div className="container-page flex flex-col items-center justify-between gap-4 text-sm text-stone-500 sm:flex-row">
        <div className="flex items-center gap-2.5">
          <span className="grid h-6 w-6 grid-cols-2 gap-0.5 rounded-md bg-stone-900 p-1" aria-hidden="true">
            <span className="rounded-[1.5px] bg-clay-300" /><span className="rounded-[1.5px] bg-clay-500" />
            <span className="rounded-[1.5px] bg-clay-500" /><span className="rounded-[1.5px] bg-clay-300" />
          </span>
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
