/** The Teacher Planner mark, drawn in the current palette's accent. */
export function BrandMark({ size = 22, className }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 22 22" aria-hidden="true">
      <circle cx="11" cy="11" r="10" fill="var(--accent)" />
      <path d="M6.5 11.5l3 3 6-7" fill="none" stroke="var(--accent-text)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
