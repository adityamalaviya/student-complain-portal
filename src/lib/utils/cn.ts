// ponytail: native class joining without clsx/tailwind-merge
export function cn(...inputs: (string | boolean | undefined | null)[]): string {
  return inputs.filter(Boolean).join(' ');
}

