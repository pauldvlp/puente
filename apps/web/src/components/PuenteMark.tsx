import type { SVGProps } from 'react';

/**
 * The puente mark — the same artwork as `public/favicon.svg`, drawn with
 * `currentColor` so it inherits from its container the way a lucide icon does.
 * Decorative by default: every place it appears is next to the word "puente".
 *
 * The viewBox is padded past the 128 box the artwork was drawn in — the strokes
 * run edge to edge there, and without the padding the mark crowds whatever tile
 * it sits in, which a lucide icon never does.
 */
export function PuenteMark({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="-8 -8 144 144"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
      className={className}
      {...props}
    >
      <path
        d="M93.2137 46.9903C93.2532 46.9902 93.2932 46.9901 93.3332 46.9901C106.588 46.9901 117.333 57.3963 117.333 70.2325C117.333 82.1963 108 92.0485 95.9998 93.3333M93.2137 46.9903C93.2926 46.1397 93.3332 45.2782 93.3332 44.4076C93.3332 28.7185 80.2004 16 63.9998 16C48.6571 16 36.0656 27.4075 34.7754 41.9423M93.2137 46.9903C92.6681 52.8498 90.2857 58.1963 86.6281 62.4853M34.7754 41.9423C21.2477 43.189 10.6665 54.2229 10.6665 67.6501C10.6665 80.144 19.8279 90.9408 31.9998 93.3333M34.7754 41.9423C35.6172 41.8647 36.4704 41.8251 37.3332 41.8251C43.3375 41.8251 48.8785 43.7469 53.3358 46.9901"
        stroke="currentColor"
        strokeWidth={9}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M63.9998 80V112M77.3332 88L50.6672 104M50.6665 88L77.3326 104"
        stroke="currentColor"
        strokeWidth={9}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
