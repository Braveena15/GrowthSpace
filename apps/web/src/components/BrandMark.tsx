type BrandMarkProps = {
  compact?: boolean;
};

/** A small, scalable identity mark for GrowthSpace. */
export function BrandMark({ compact = false }: BrandMarkProps) {
  return (
    <div className={compact ? "brand-lockup brand-lockup-compact" : "brand-lockup"}>
      <span className="brand-mark" aria-hidden="true">
        <svg viewBox="0 0 40 40" focusable="false">
          <path d="M7 31.5a4.5 4.5 0 1 1 9 0v1H7v-1Zm8.5-8.5a4.5 4.5 0 1 1 9 0v9.5h-9V23Zm8.5-8.5a4.5 4.5 0 1 1 9 0v18h-9v-18Z" />
          <path className="brand-spark" d="m13 9 1.35 3.65L18 14l-3.65 1.35L13 19l-1.35-3.65L8 14l3.65-1.35L13 9Z" />
        </svg>
      </span>
      {!compact && <span className="brand-name">GrowthSpace</span>}
    </div>
  );
}
