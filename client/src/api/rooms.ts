import { apiGet, apiPost } from "./client";
import type { RoomAnalysis, RoomUpload } from "./types";
import { preprocessRoomImage } from "@/lib/imagePreprocess";

export const SUPPORTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const MAX_ROOM_IMAGE_BYTES = 10 * 1024 * 1024; // must match server/ai/config.ts image.maxRoomImageBytes

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // strip the "data:image/jpeg;base64," prefix
      const commaIndex = result.indexOf(",");
      resolve(result.slice(commaIndex + 1));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export interface RoomImageValidationError {
  message: string;
}

/** Client-side pre-check mirroring the server's actual limits — never a substitute for server validation, just faster feedback. */
export function validateRoomImageFile(file: File): RoomImageValidationError | null {
  if (!(SUPPORTED_IMAGE_TYPES as readonly string[]).includes(file.type)) {
    return { message: "Please upload a JPEG, PNG, or WebP image." };
  }
  if (file.size > MAX_ROOM_IMAGE_BYTES) {
    return { message: `This image is too large (${(file.size / (1024 * 1024)).toFixed(1)} MB). The maximum is 10 MB.` };
  }
  return null;
}

interface RoomUploadResponse {
  room: { id: string; projectId: string; status: RoomUpload["status"]; createdAt: string };
}

/**
 * Uploads a room photo. The photo is first downsized in the browser when needed to stay under Vercel's
 * 4.5 MB request-body limit (see lib/imageSizing.ts), so the STORED image may be the resized copy.
 * Throws ImagePreprocessError if the photo can't be prepared. The server re-validates whatever it receives.
 */
export async function uploadRoom(projectId: string, file: File): Promise<RoomUploadResponse["room"]> {
  const prepared = await preprocessRoomImage(file);
  const base64Data = await fileToBase64(prepared);
  const res = await apiPost<RoomUploadResponse>("/api/rooms/upload", {
    projectId,
    fileName: prepared.name,
    mimeType: prepared.type,
    base64Data,
  });
  return res.room;
}

export async function getRoom(roomId: string): Promise<RoomUpload> {
  const res = await apiGet<{ room: RoomUpload }>(`/api/rooms/${roomId}`);
  return res.room;
}

export async function analyzeRoom(roomId: string): Promise<{ analysis: RoomAnalysis; reused: boolean }> {
  return apiPost<{ analysis: RoomAnalysis; reused: boolean }>(`/api/rooms/${roomId}/analyze`);
}

/** Never triggers a new analysis — read-only lookup of a reusable artifact. Returns null if none exists yet. */
export async function getRoomAnalysis(roomId: string): Promise<RoomAnalysis | null> {
  try {
    const res = await apiGet<{ analysis: RoomAnalysis }>(`/api/rooms/${roomId}/analysis`);
    return res.analysis;
  } catch (err) {
    if (err instanceof Error && "code" in err && (err as { code: string }).code === "ANALYSIS_NOT_FOUND") {
      return null;
    }
    throw err;
  }
}
