/** Decorative, purely visual tile-grid illustration (no product data). */
export function TilePattern({ className }: { className?: string }) {
  const cols = 8;
  const rows = 8;
  const tones = ["#D9D0C2", "#D6BC8D", "#E8EEE7", "#C4A873", "#F3F6F1", "#536B5D"];
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
