/**
 * ARQENIUM brand mark - original SVG geometry (no generated image).
 * An arch/"arq" form enclosing a connected agent node graph.
 */
export function BrandMark({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      className={className}
      aria-label="ARQENIUM"
      role="img"
    >
      <rect x="0.75" y="0.75" width="30.5" height="30.5" rx="7.5" stroke="currentColor" strokeOpacity="0.28" strokeWidth="1.5" />
      {/* Arch */}
      <path d="M10 25V15.2C10 11.8 12.7 9 16 9C19.3 9 22 11.8 22 15.2V25" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      {/* Node graph */}
      <circle cx="16" cy="15.5" r="2.1" fill="currentColor" />
      <circle cx="10.3" cy="20.6" r="1.35" fill="currentColor" fillOpacity="0.75" />
      <circle cx="21.7" cy="20.6" r="1.35" fill="currentColor" fillOpacity="0.75" />
      <path d="M14.3 16.6L11.3 19.6M17.7 16.6L20.7 19.6" stroke="currentColor" strokeWidth="1.1" strokeOpacity="0.6" />
    </svg>
  );
}

export function BrandWordmark() {
  return (
    <div className="brand-text">
      <span className="brand-name">Arqenium</span>
      <span className="brand-tag">Engineering OS</span>
    </div>
  );
}
