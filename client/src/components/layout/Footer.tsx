export function Footer() {
  return (
    <footer className="border-t border-stone-200 bg-white py-8">
      <div className="container-page flex flex-col items-center justify-between gap-3 text-sm text-stone-500 sm:flex-row">
        <span className="font-display text-base text-stone-900">Attelier</span>
        <span>AI-powered photorealistic visualization for your space.</span>
        <span>&copy; {new Date().getFullYear()} Attelier</span>
      </div>
    </footer>
  );
}
