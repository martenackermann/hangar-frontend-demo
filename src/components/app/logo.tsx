/** Hangar mark (amber tile, hangar arch). Matches public/favicon.svg. */
export function Logo({ size = 22, className }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 22 22" width={size} height={size} aria-hidden="true" className={className}>
      <rect width="22" height="22" rx="4" fill="#FFB224" />
      <path d="M4.5 17.5V11a6.5 6.5 0 0 1 13 0v6.5" fill="none" stroke="#1B1300" strokeWidth="2" />
      <path d="M8.5 17.5v-4h5v4" fill="none" stroke="#1B1300" strokeWidth="1.6" />
      <path d="M3 17.5h16" stroke="#1B1300" strokeWidth="1.6" />
    </svg>
  )
}
