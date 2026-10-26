import { useEffect, useState } from "react";
import { maskGrid, toLab } from "./areaMask";

export interface LoadedPhoto {
  /** The decoded photo, for drawing the quick look. */
  image: HTMLImageElement;
  width: number;
  height: number;
  /** The marking grid over this photo. */
  grid: { width: number; height: number };
  /** The photo's colours per grid cell (CIE Lab) for "tap to fill"; null when the browser may not read them (then only the brush works). */
  lab: Float32Array | null;
}

/** Photos uploaded in this tab, by room id: shown straight from the phone's copy, with no download and no expiry. */
const localPhotos = new Map<string, string>();

export function rememberLocalPhoto(roomId: string, file: Blob): void {
  try {
    localPhotos.set(roomId, URL.createObjectURL(file));
  } catch {
    /* object URLs unavailable: the signed URL is used instead */
  }
}

export function localPhotoUrl(roomId: string): string | null {
  return localPhotos.get(roomId) ?? null;
}

function load(url: string, crossOrigin: boolean): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (crossOrigin) img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("photo failed to load"));
    img.src = url;
  });
}

function readLab(img: HTMLImageElement, grid: { width: number; height: number }): Float32Array | null {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = grid.width;
    canvas.height = grid.height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, grid.width, grid.height);
    return toLab(ctx.getImageData(0, 0, grid.width, grid.height).data, grid.width * grid.height);
  } catch {
    // A photo from another site without permission to read it: painting still works, tap-to-fill does not.
    return null;
  }
}

/** Loads the room photo once per URL. */
export function useRoomPhoto(url: string | null): { photo: LoadedPhoto | null; failed: boolean } {
  const [photo, setPhoto] = useState<LoadedPhoto | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    setFailed(false);
    load(url, !url.startsWith("blob:"))
      .catch(() => load(url, false))
      .then((image) => {
        if (cancelled) return;
        const grid = maskGrid(image.naturalWidth, image.naturalHeight);
        setPhoto({ image, width: image.naturalWidth, height: image.naturalHeight, grid, lab: readLab(image, grid) });
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [url]);
  return { photo, failed };
}

/** Loads tile photos for the quick look; returns those that have loaded, by tile id. */
export function useTileImages(urls: Array<{ id: string; url: string }>): Map<string, HTMLImageElement> {
  const [loaded, setLoaded] = useState<Map<string, HTMLImageElement>>(new Map());
  const key = urls.map((u) => u.id).sort().join(",");
  useEffect(() => {
    let cancelled = false;
    for (const { id, url } of urls) {
      if (loaded.has(id)) continue;
      load(url, false)
        .then((img) => !cancelled && setLoaded((prev) => new Map(prev).set(id, img)))
        .catch(() => undefined);
    }
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return loaded;
}
