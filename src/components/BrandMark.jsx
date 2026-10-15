// The "tp" letters are Lexend SemiBold, outlined so the mark never depends on a font.
const LETTERS = 'M17.03 27V14.4H19.72V27ZM15.15 19.37V16.95H21.79V19.37ZM22.55 31.18V16.95H25.15L25.23 19.22L24.74 19.05Q24.86 18.44 25.38 17.92Q25.91 17.4 26.69 17.08Q27.46 16.77 28.32 16.77Q29.64 16.77 30.66 17.43Q31.67 18.1 32.26 19.27Q32.85 20.44 32.85 21.97Q32.85 23.47 32.27 24.65Q31.68 25.82 30.65 26.5Q29.63 27.17 28.32 27.17Q27.46 27.17 26.66 26.84Q25.87 26.5 25.33 25.96Q24.78 25.41 24.63 24.78L25.26 24.51V31.18ZM27.71 24.85Q28.46 24.85 29.03 24.49Q29.59 24.12 29.91 23.47Q30.23 22.82 30.23 21.97Q30.23 21.11 29.92 20.46Q29.6 19.81 29.04 19.45Q28.47 19.09 27.71 19.09Q26.95 19.09 26.38 19.44Q25.81 19.8 25.49 20.46Q25.17 21.11 25.17 21.97Q25.17 22.82 25.49 23.47Q25.81 24.12 26.38 24.49Q26.95 24.85 27.71 24.85Z';

/** The Teacher Planner mark ("tp" over a class period), drawn in the current palette's accent. */
export function BrandMark({ size = 22, className }) {
  return (
    <svg className={className} width={size} height={size} viewBox="4 4 40 40" aria-hidden="true">
      <rect x="4" y="4" width="40" height="40" rx="12" fill="var(--accent)" />
      <path d={LETTERS} fill="var(--accent-text)" />
      <rect x="12" y="32" width="24" height="5" rx="2.5" fill="var(--accent-text)" />
    </svg>
  );
}
