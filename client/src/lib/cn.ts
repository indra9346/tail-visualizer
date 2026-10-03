import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Joins class names and lets the last conflicting Tailwind class win, so `className` overrides on shared components really apply. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
