import { cn } from "@/lib/cn";

/** Line icons for the simple app: one picture next to every word, so owners who read little can still find things. */
const PATHS = {
  home: "M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z",
  users: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 3a4 4 0 1 1 0 8 4 4 0 0 1 0-8z M22 21v-2a4 4 0 0 0-3-3.9 M16 3.1a4 4 0 0 1 0 7.8",
  user: "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2 M12 3a4 4 0 1 1 0 8 4 4 0 0 1 0-8z",
  camera: "M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3z M12 9.5a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7z",
  image: "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z M9 7a2 2 0 1 1 0 4 2 2 0 0 1 0-4z M21 15l-3.1-3.1a2 2 0 0 0-2.8 0L6 21",
  tiles: "M4 3h5a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z M15 3h5a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1h-5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z M4 14h5a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-5a1 1 0 0 1 1-1z M15 14h5a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1h-5a1 1 0 0 1-1-1v-5a1 1 0 0 1 1-1z",
  menu: "M4 6h16 M4 12h16 M4 18h16",
  back: "M19 12H5 M12 19l-7-7 7-7",
  next: "M5 12h14 M12 5l7 7-7 7",
  check: "M20 6 9 17l-5-5",
  close: "M18 6 6 18 M6 6l12 12",
  plus: "M12 5v14 M5 12h14",
  chevron: "m9 18 6-6-6-6",
  volume: "M11 5 6 9H2v6h4l5 4z M15.5 8.5a5 5 0 0 1 0 7 M19 5a10 10 0 0 1 0 14",
  stop: "M6 6h12v12H6z",
  brush: "m9.06 11.9 8.07-8.06a2.85 2.85 0 1 1 4.03 4.03l-8.06 8.08 M7.07 14.94c-1.66 0-3 1.35-3 3.02 0 1.33-2.5 1.52-2 2.02 1.08 1.1 2.49 2.02 4 2.02 2.2 0 4-1.8 4-4.04a3.01 3.01 0 0 0-3-3.02z",
  eraser: "m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21 M22 21H7 M5 11l9 9",
  undo: "M3 7v6h6 M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13",
  retry: "M21 12a9 9 0 1 1-3-6.7L21 8 M21 3v5h-5",
  sparkles: "M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z",
  whatsapp: "M21 11.5a8.4 8.4 0 0 1-12.4 7.4L3 21l2.1-5.4A8.4 8.4 0 1 1 21 11.5z",
  calculator: "M6 2h12a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z M8 6h8 M8 11h.01 M12 11h.01 M16 11h.01 M8 15h.01 M12 15h.01 M16 15h.01 M8 19h8",
  compare: "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z M12 3v18",
  download: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4 M7 10l5 5 5-5 M12 15V3",
  expand: "M8 3H5a2 2 0 0 0-2 2v3 M21 8V5a2 2 0 0 0-2-2h-3 M16 21h3a2 2 0 0 0 2-2v-3 M3 16v3a2 2 0 0 0 2 2h3",
  search: "M11 4a7 7 0 1 1 0 14 7 7 0 0 1 0-14z m10 17-4.3-4.3",
  mic: "M12 2a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3z M19 10v2a7 7 0 0 1-14 0v-2 M12 19v3",
  layers: "m12 2 10 5-10 5L2 7z m-10 15 10 5 10-5 M2 12l10 5 10-5",
  phone: "M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z",
  store: "M3 9l1.5-5h15L21 9 M3 9v11h18V9 M3 9h18 M9 20v-6h6v6",
  card: "M4 5h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z M2 10h20",
  logout: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4 M16 17l5-5-5-5 M21 12H9",
  play: "M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20z M10 8l6 4-6 4z",
  history: "M3 12a9 9 0 1 0 3-6.7L3 8 M3 3v5h5 M12 7v5l3 2",
  alert: "M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z M12 9v4 M12 17h.01",
  info: "M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20z M12 16v-4 M12 8h.01",
  sun: "M12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8z M12 2v2 M12 20v2 M4.9 4.9l1.4 1.4 M17.7 17.7l1.4 1.4 M2 12h2 M20 12h2 M4.9 19.1l1.4-1.4 M17.7 6.3l1.4-1.4",
  door: "M5 21V4a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v17 M3 21h18 M15 12h.01",
  mobile: "M8 2h8a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z M11 18h2",
  tv: "M4 4h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z M8 21h8 M12 17v4",
  trash: "M3 6h18 M8 6V4h8v2 M19 6l-1 14H6L5 6",
  eye: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z M12 9a3 3 0 1 1 0 6 3 3 0 0 1 0-6z",
  eyeOff: "M2 2l20 20 M6.7 6.7C3.9 8.4 2 12 2 12s3.5 7 10 7c1.9 0 3.6-.6 5-1.4 M10.6 5.1C11 5 11.5 5 12 5c6.5 0 10 7 10 7s-.8 1.6-2.3 3.3",
  floor: "M2 20 6 12h12l4 8z M12 12v8 M4 16h16",
  wall: "M3 4h18v16H3z M3 9.3h18 M3 14.6h18 M9 4v5.3 M15 9.3v5.3 M9 14.6V20",
  room: "M4 3h16v9H4z M4 12 2 21h20l-2-9 M12 12v9",
  kitchen: "M3 13h18v8H3z M3 13V3h18v10 M7 17h2 M15 17h2 M8 7h.01 M12 7h.01 M16 7h.01",
  shower: "M5 21V6a3 3 0 0 1 6 0 M8 8h8 M10 12v1 M14 12v1 M12 15v1 M10 18v1 M14 18v1",
  steps: "M3 21h5v-5h5v-5h5V6h3",
  house: "M3 10.5 12 3l9 7.5V21H3z M9 21v-6h6v6",
  wifiOff: "M2 2l20 20 M8.5 16.5a5 5 0 0 1 7 0 M2 8.8a15 15 0 0 1 4.2-2.6 M10.7 5.1A15 15 0 0 1 22 8.8 M5 12.9a10 10 0 0 1 5.2-2.7 M16.8 11.2A10 10 0 0 1 19 12.9 M12 20h.01",
  thumb: "M7 10v11H3V10z M7 10l4-8a3 3 0 0 1 3 3v4h6a2 2 0 0 1 2 2.3l-1.4 8A2 2 0 0 1 18.6 21H7",
  share: "M18 3a3 3 0 1 1 0 6 3 3 0 0 1 0-6z M6 9a3 3 0 1 1 0 6 3 3 0 0 1 0-6z M18 15a3 3 0 1 1 0 6 3 3 0 0 1 0-6z M8.6 13.5l6.8 4 M15.4 6.5l-6.8 4",
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, className, strokeWidth = 2 }: { name: IconName; className?: string; strokeWidth?: number }) {
  return (
    <svg className={cn("h-6 w-6 shrink-0", className)} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  );
}
