/**
 * Sends photos and a message to WhatsApp the simplest way the phone allows: the phone's share sheet with the photos
 * attached (pick WhatsApp, then the customer). Where a browser cannot share files (most laptops), WhatsApp opens with
 * the message and the caller saves the photos for the owner to attach.
 */
export async function shareToWhatsApp(files: File[], text: string): Promise<"shared" | "cancelled" | "message-only"> {
  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
  if (files.length > 0 && typeof nav.share === "function" && nav.canShare?.({ files })) {
    try {
      await nav.share({ files, text });
      return "shared";
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return "cancelled";
    }
  }
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener");
  return "message-only";
}

/** The bytes of a (signed, short-lived) image URL as a file that can be shared or saved. */
export async function imageFile(url: string, name: string): Promise<File> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`image fetch failed with status ${res.status}`);
  const blob = await res.blob();
  const ext = blob.type.includes("png") ? "png" : "jpg";
  return new File([blob], `${name}.${ext}`, { type: blob.type || "image/jpeg" });
}

/** Saves a file to the phone's downloads. */
export function saveFile(file: File): void {
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
