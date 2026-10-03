import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// Teach tailwind-merge the brand tokens from app/globals.css. Without this it
// reads text-body as a color (dropping it next to text-ink) and font-title as a
// font family (dropping font-sans).
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: ["body", "secondary", "title"],
      "font-weight": ["title", "body", "strong", "lead"],
      container: ["link"],
      ease: ["out-quart", "in-out-quart"],
    },
  },
});

/** Composes class names; later Tailwind utilities win over conflicting earlier ones. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
