import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { ErrorState } from "@/components/ui/ErrorState";
import { FlowHeader, GroupLabel, Question, Screen, bigButton } from "@/components/simple/Flow";
import { Icon, type IconName } from "@/components/simple/Icon";
import { validateRoomImageFile, uploadRoom } from "@/api/rooms";
import { preprocessRoomImage } from "@/lib/imagePreprocess";
import { createProject } from "@/api/projects";
import { listProjects } from "@/api/projectsRooms";
import { friendlyErrorMessage } from "@/api/client";
import { useWorkflow } from "@/context/WorkflowContext";
import { rememberLocalPhoto } from "@/lib/useRoomPhoto";
import { DEFAULT_PROJECT_NAME, SAMPLE_PROJECT_NAME } from "@/lib/customers";
import type { Project } from "@/api/types";

export { DEFAULT_PROJECT_NAME, SAMPLE_PROJECT_NAME };

const TIPS: Array<{ icon: IconName; text: string }> = [
  { icon: "door", text: "Stand at the door. Show the whole wall or floor." },
  { icon: "sun", text: "Switch on the lights." },
  { icon: "mobile", text: "Hold the phone straight, not tilted." },
];

/** Rooms to try tiles on when the customer has no photo with them. */
const SAMPLES = [
  { label: "Bathroom", src: "/images/demo/washroom_before.jpg", position: "50% 40%" },
  { label: "House front", src: "/images/walls/entrance.jpg", position: "50% 50%" },
  { label: "Living wall", src: "/images/walls/brick-beige.jpg", position: "50% 50%" },
];

/**
 * Step 1 of a new design: one tap to take or choose a photo (or try a sample room). A customer name is optional;
 * without one the photo goes to "My rooms" (walk-in customers). The photo check then runs on the next screen.
 */
export function QuickUploadPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { setProject, setRoom } = useWorkflow();
  const galleryRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [name, setName] = useState("");
  const [naming, setNaming] = useState(false);
  // "New room for <customer>" opens this page with that customer already chosen.
  const [fixedProjectId, setFixedProjectId] = useState<string | null>(() => params.get("project"));
  const [file, setFile] = useState<File | null>(null);
  const [isSample, setIsSample] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [loadingSample, setLoadingSample] = useState<string | null>(null);

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

  const fixedProject = fixedProjectId ? (projects?.find((p) => p.id === fixedProjectId) ?? null) : null;

  function choose(selected: File | undefined, sample = false) {
    if (!selected) return;
    const problem = validateRoomImageFile(selected);
    setError(problem?.message ?? null);
    setFile(problem ? null : selected);
    setIsSample(!problem && sample);
  }

  async function chooseSample(sample: (typeof SAMPLES)[number]) {
    setLoadingSample(sample.label);
    setError(null);
    try {
      const res = await fetch(sample.src);
      if (!res.ok) throw new Error(`sample ${res.status}`);
      const blob = await res.blob();
      choose(new File([blob], `sample-${sample.label.toLowerCase().replace(/\s+/g, "-")}.jpg`, { type: blob.type || "image/jpeg" }), true);
    } catch {
      setError("We couldn't open the sample room. Check your internet and try again.");
    } finally {
      setLoadingSample(null);
    }
  }

  /** The project for this photo: the chosen customer, else the one with the typed name (or the default), created only if it does not exist yet. */
  async function projectFor(): Promise<string> {
    if (fixedProjectId && (fixedProject || projects === null)) return fixedProjectId;
    const wanted = name.trim() || (isSample ? SAMPLE_PROJECT_NAME : DEFAULT_PROJECT_NAME);
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

  const customerLabel = fixedProject ? fixedProject.name : name.trim() || "Walk-in customer";

  return (
    <Screen>
      <FlowHeader step={1} back="/" listen="Take a photo of the room. Tap Take photo to open the camera, or choose a photo from your gallery or WhatsApp. No photo? Try a sample room." />
      <div className="space-y-3.5">
        <Question>Take a photo of the room</Question>

        <div className="flex items-center gap-2.5 rounded-2xl border-[1.5px] border-hairline bg-white py-1.5 pl-3.5 pr-1.5">
          <Icon name="user" />
          {naming && !fixedProject ? (
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={200}
              aria-label="Customer or room name"
              placeholder={`Customer name (empty = walk-in)`}
              className="h-10 min-w-0 flex-1 rounded-lg border-[1.5px] border-[#C9D2C6] px-2.5 text-base"
            />
          ) : (
            <span className="min-w-0 flex-1 truncate text-base font-bold">{customerLabel}</span>
          )}
          {fixedProject ? (
            <button type="button" onClick={() => setFixedProjectId(null)} className="h-10 rounded-[10px] bg-sage-200 px-3.5 text-[15px] font-bold">
              Change
            </button>
          ) : (
            <button type="button" onClick={() => setNaming((v) => !v)} className="h-10 rounded-[10px] bg-sage-200 px-3.5 text-[15px] font-bold">
              {naming ? "Done" : name.trim() ? "Change" : "Add name"}
            </button>
          )}
        </div>

        {preview && file ? (
          <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} className="overflow-hidden rounded-3xl border-[1.5px] border-hairline bg-white">
            <img src={preview} alt="The room photo you chose" className="max-h-[52vh] w-full bg-stone-100 object-contain" />
            <div className="space-y-2.5 p-3.5">
              <button type="button" onClick={send} disabled={sending} className={bigButton("primary")}>
                {sending ? (
                  <>
                    <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/50 border-t-white" aria-hidden="true" /> Sending your photo…
                  </>
                ) : (
                  <>
                    Use this photo <Icon name="next" />
                  </>
                )}
              </button>
              <button type="button" onClick={() => galleryRef.current?.click()} disabled={sending} className={bigButton("secondary", "min-h-[52px] text-base")}>
                Choose a different photo
              </button>
            </div>
          </motion.div>
        ) : (
          <>
            <button type="button" onClick={() => cameraRef.current?.click()} className="flex h-[116px] w-full flex-col items-center justify-center gap-1.5 rounded-[22px] bg-stone-900 text-white shadow-[0_10px_24px_rgba(58,71,62,0.25)] hover:bg-stone-950">
              <Icon name="camera" className="h-10 w-10" strokeWidth={1.8} />
              <span className="text-[21px] font-extrabold leading-6">Take photo</span>
              <span className="text-sm text-sage-300">Opens the camera</span>
            </button>
            <button type="button" onClick={() => galleryRef.current?.click()} className={bigButton("secondary", "min-h-[64px]")}>
              <Icon name="image" />
              Choose from gallery / WhatsApp
            </button>
          </>
        )}

        {error && <ErrorState message={error} onRetry={file ? send : undefined} />}

        <section id="samples" aria-labelledby="sample-title" className="pt-1.5">
          <GroupLabel id="sample-title">No photo? Use a sample room</GroupLabel>
          <div className="mt-2.5 grid grid-cols-3 gap-2.5">
            {SAMPLES.map((s) => (
              <button key={s.label} type="button" onClick={() => chooseSample(s)} disabled={loadingSample !== null || sending} className="flex flex-col gap-1.5 text-left text-[15px] font-bold text-ink disabled:opacity-60">
                <span className="relative block h-[84px] w-full overflow-hidden rounded-2xl bg-stone-200">
                  <img src={s.src} alt="" className="h-full w-full object-cover" style={{ objectPosition: s.position }} />
                  {loadingSample === s.label && <span className="absolute inset-0 flex items-center justify-center bg-white/60"><span className="h-6 w-6 animate-spin rounded-full border-2 border-stone-300 border-t-stone-900" aria-label="Opening the sample room" /></span>}
                </span>
                {s.label}
              </button>
            ))}
          </div>
        </section>

        <section aria-labelledby="tips-title" className="pb-6 pt-1">
          <GroupLabel id="tips-title">For a good result</GroupLabel>
          <ul className="mt-2 space-y-2">
            {TIPS.map((tip) => (
              <li key={tip.text} className="flex items-center gap-3 text-base text-ink">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sage-200">
                  <Icon name={tip.icon} />
                </span>
                {tip.text}
              </li>
            ))}
          </ul>
        </section>
      </div>

      <input ref={galleryRef} type="file" accept="image/*" className="sr-only" aria-label="Choose a room photo" onChange={(e) => choose(e.target.files?.[0])} />
      {/* A second input forces the camera on phones (one input cannot do both on every browser). */}
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="sr-only" aria-label="Take a room photo" onChange={(e) => choose(e.target.files?.[0])} />
    </Screen>
  );
}
