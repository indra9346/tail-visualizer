import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { PageContainer } from "@/components/layout/PageContainer";
import { ErrorState } from "@/components/ui/ErrorState";
import { validateRoomImageFile, uploadRoom } from "@/api/rooms";
import { preprocessRoomImage } from "@/lib/imagePreprocess";
import { createProject } from "@/api/projects";
import { listProjects } from "@/api/projectsRooms";
import { friendlyErrorMessage } from "@/api/client";
import { useWorkflow } from "@/context/WorkflowContext";
import { rememberLocalPhoto } from "@/lib/useRoomPhoto";
import type { Project } from "@/api/types";

/** Photos uploaded without a customer name are kept together in this project. */
export const DEFAULT_PROJECT_NAME = "My rooms";

const TIPS = [
  { icon: "🚪", text: "Stand at the door and show the whole space" },
  { icon: "💡", text: "Switch on the lights" },
  { icon: "📐", text: "Hold the phone straight, not tilted" },
];

/**
 * Step 1 of the easy visualizer: one tap to take or choose a photo. A customer name is optional; without one the photo
 * goes into the "My rooms" project. The room check then runs on the next screen while the owner marks the photo.
 */
export function QuickUploadPage() {
  const navigate = useNavigate();
  const { setProject, setRoom } = useWorkflow();
  const galleryRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    listProjects()
      .then(setProjects)
      .catch(() => setProjects([]));
  }, []);

  useEffect(() => {
    if (!file) return setPreview(null);
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function choose(selected: File | undefined) {
    if (!selected) return;
    const problem = validateRoomImageFile(selected);
    setError(problem?.message ?? null);
    setFile(problem ? null : selected);
  }

  /** The project for this photo: the one with the typed name (or "My rooms"), created only if it does not exist yet. */
  async function projectFor(): Promise<string> {
    const wanted = name.trim() || DEFAULT_PROJECT_NAME;
    const existing = (projects ?? []).find((p) => p.name.trim().toLowerCase() === wanted.toLowerCase());
    if (existing) return existing.id;
    const created = await createProject(wanted);
    // Remembered at once: if the upload below fails, trying again reuses this project instead of making a second one.
    setProjects((prev) => [created, ...(prev ?? [])]);
    return created.id;
  }

  async function send() {
    if (!file || sending) return;
    setSending(true);
    setError(null);
    try {
      const prepared = await preprocessRoomImage(file);
      const projectId = await projectFor();
      setProject(projectId);
      const room = await uploadRoom(projectId, prepared);
      rememberLocalPhoto(room.id, prepared);
      setRoom(room.id);
      navigate(`/visualize/${room.id}`);
    } catch (err) {
      setError(friendlyErrorMessage(err, "We couldn't send this photo. Check your internet and try again."));
    } finally {
      setSending(false);
    }
  }

  return (
    <PageContainer compact className="max-w-2xl">
      <p className="text-sm font-semibold text-stone-500">Step 1</p>
      <h1 className="mt-1 font-display text-3xl text-stone-900 sm:text-4xl">Take a photo of the room</h1>
      <p className="mt-2 text-base text-stone-600">Then you colour where the tiles go and pick a tile. We make a real-looking photo of the finished room.</p>

      {preview && file ? (
        <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} className="mt-6 overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-md">
          <img src={preview} alt="The room photo you chose" className="max-h-[55vh] w-full object-contain bg-stone-100" />
          <div className="space-y-3 p-4">
            <button
              type="button"
              onClick={send}
              disabled={sending}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-stone-900 px-5 py-4 text-lg font-bold text-white shadow-md hover:bg-stone-800 disabled:bg-stone-500"
            >
              {sending ? (
                <>
                  <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/50 border-t-white" aria-hidden="true" /> Sending your photo…
                </>
              ) : (
                <>Use this photo →</>
              )}
            </button>
            <button type="button" onClick={() => galleryRef.current?.click()} disabled={sending} className="w-full rounded-2xl border border-stone-300 bg-white px-5 py-3 text-base font-semibold text-stone-700 hover:bg-stone-50 disabled:opacity-50">
              Choose a different photo
            </button>
            <details className="rounded-xl bg-stone-50 px-3 py-2">
              <summary className="cursor-pointer text-sm font-medium text-stone-600">Customer or room name (optional)</summary>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={200}
                aria-label="Customer or room name"
                placeholder={`e.g. Ramesh – bathroom (empty = "${DEFAULT_PROJECT_NAME}")`}
                className="mt-2 w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-base"
              />
            </details>
          </div>
        </motion.div>
      ) : (
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => cameraRef.current?.click()}
            className="flex flex-col items-center gap-3 rounded-3xl bg-stone-900 px-6 py-9 text-white shadow-lg transition-transform hover:-translate-y-0.5"
          >
            <span className="text-5xl" aria-hidden="true">
              📷
            </span>
            <span className="text-xl font-bold">Take a photo</span>
            <span className="text-sm text-white/70">Opens the camera</span>
          </button>
          <button
            type="button"
            onClick={() => galleryRef.current?.click()}
            className="flex flex-col items-center gap-3 rounded-3xl border-2 border-stone-300 bg-white px-6 py-9 text-stone-900 shadow-sm transition-transform hover:-translate-y-0.5"
          >
            <span className="text-5xl" aria-hidden="true">
              🖼️
            </span>
            <span className="text-xl font-bold">Choose a photo</span>
            <span className="text-sm text-stone-500">From your gallery or files</span>
          </button>
        </div>
      )}

      {error && (
        <div className="mt-4">
          <ErrorState message={error} onRetry={file ? send : undefined} />
        </div>
      )}

      <ul className="mt-6 grid gap-2 sm:grid-cols-3">
        {TIPS.map((tip) => (
          <li key={tip.text} className="flex items-center gap-3 rounded-2xl bg-white/70 px-3 py-2.5 text-sm text-stone-700 ring-1 ring-stone-200">
            <span className="text-2xl" aria-hidden="true">
              {tip.icon}
            </span>
            {tip.text}
          </li>
        ))}
      </ul>

      <input ref={galleryRef} type="file" accept="image/*" className="sr-only" aria-label="Choose a room photo" onChange={(e) => choose(e.target.files?.[0])} />
      {/* A second input forces the camera on phones (one input cannot do both on every browser). */}
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="sr-only" aria-label="Take a room photo" onChange={(e) => choose(e.target.files?.[0])} />
    </PageContainer>
  );
}
