import type { SVGProps } from "react";

const S1_MARK =
  "M0 0h28v6H0zm0 0h6v16H0zm0 13h28v6H0zm22 13h6v19h-6zM0 26h28v6H0zM36 0h8v6h-8zM40 0h8v32h-8zM34 26h22v6H34z";

export function S1Wordmark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} viewBox="0 0 64 32" xmlns="http://www.w3.org/2000/svg">
      <path d={S1_MARK} fill="currentColor" />
    </svg>
  );
}
