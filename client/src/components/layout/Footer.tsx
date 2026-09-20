export function Footer() {
  return (
    <footer className="border-t border-stone-200 py-8">
      <div className="container-page flex flex-col items-center justify-between gap-3 text-sm text-stone-500 sm:flex-row">
        <span>© {new Date().getFullYear()} Attelier. AI-powered photorealistic visualization.</span>
        <span>Real rooms. Real tiles. Real results.</span>
      </div>
    </footer>
  );
}
