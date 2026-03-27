interface HermesLogoProps {
  size?: number;
  borderRadius?: number;
}

export default function HermesLogo({ size = 32, borderRadius }: HermesLogoProps) {
  const r = borderRadius ?? Math.round(size * 0.28);
  const s = size;

  // H mark proportions scaled to size
  const pad   = s * 0.22;          // outer padding
  const barW  = s * 0.155;         // vertical bar width
  const barH  = s * 0.56;          // vertical bar height (top to bottom)
  const barY  = (s - barH) / 2;    // centered vertically
  const inner = s - pad - barW;    // x of right bar
  const crossH = s * 0.145;        // crossbar height
  const crossY = barY + barH * 0.42; // crossbar y (slightly above mid)
  const rx    = barW * 0.38;       // radius on bar corners

  return (
    <svg
      width={s}
      height={s}
      viewBox={`0 0 ${s} ${s}`}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Background */}
      <rect width={s} height={s} rx={r} fill="url(#hgrad)" />

      {/* Left vertical */}
      <rect x={pad} y={barY} width={barW} height={barH} rx={rx} fill="white" />

      {/* Right vertical */}
      <rect x={inner} y={barY} width={barW} height={barH} rx={rx} fill="white" />

      {/* Crossbar */}
      <rect x={pad} y={crossY} width={s - pad * 2} height={crossH} rx={rx} fill="white" />

      <defs>
        <linearGradient id="hgrad" x1="0" y1="0" x2={s} y2={s} gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#F97316" />
          <stop offset="100%" stopColor="#C2410C" />
        </linearGradient>
      </defs>
    </svg>
  );
}
