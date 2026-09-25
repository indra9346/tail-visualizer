/** Decorative, purely visual tile-grid illustration (no product data). */
export function TilePattern({ className }: { className?: string }) {
  const cols = 8;
  const rows = 8;
  const tones = ["#d4b892", "#c19a68", "#e6d5c1", "#ab8050", "#f3ebe1", "#8f6740"];
  return (
    <svg className={className} viewBox="0 0 400 400" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      {Array.from({ length: rows * cols }).map((_, i) => {
        const x = (i % cols) * 50;
        const y = Math.floor(i / cols) * 50;
        return <rect key={i} x={x + 2} y={y + 2} width={46} height={46} rx={3} fill={tones[(i * 7 + Math.floor(i / cols) * 3) % tones.length]} />;
      })}
    </svg>
  );
}
