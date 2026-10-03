import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PageContainer } from "@/components/layout/PageContainer";
import { Dropzone } from "@/components/upload/Dropzone";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card, CardBody } from "@/components/ui/Card";
import { ErrorState } from "@/components/ui/ErrorState";
import { PageBanner } from "@/components/ui/PageBanner";
import { validateRoomImageFile, uploadRoom } from "@/api/rooms";
import { preprocessRoomImage } from "@/lib/imagePreprocess";
import { createProject } from "@/api/projects";
import { listProjects } from "@/api/projectsRooms";
import { friendlyErrorMessage } from "@/api/client";
import { useWorkflow } from "@/context/WorkflowContext";
import type { Project } from "@/api/types";

export function UploadPage() {
  const navigate = useNavigate();
  const { setProject, setRoom } = useWorkflow();

  const [projects, setProjects] = useState<Project[] | null>(null);
  const [projectMode, setProjectMode] = useState<"existing" | "new">("new");
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [newProjectName, setNewProjectName] = useState("");

  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    listProjects()
      .then((list) => {
        setProjects(list);
        if (list.length > 0) {
          setProjectMode("existing");
          setSelectedProjectId(list[0].id);
        }
      })
      .catch(() => setProjects([]));
  }, []);

  function handleFileSelected(selected: File) {
    const err = validateRoomImageFile(selected);
    setFile(selected);
    setFileError(err?.message ?? null);
  }

  const canSubmit =
    !!file &&
    !fileError &&
    !submitting &&
    (projectMode === "new" ? newProjectName.trim().length > 0 : selectedProjectId.length > 0);

  async function handleSubmit() {
    if (!file || fileError) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const prepared = await preprocessRoomImage(file);

      const projectId =
        projectMode === "new" ? (await createProject(newProjectName.trim())).id : selectedProjectId;

      setProject(projectId);
      const room = await uploadRoom(projectId, prepared);
      setRoom(room.id);
      navigate(`/analysis/${room.id}`);
    } catch (err) {
      setSubmitError(friendlyErrorMessage(err, "We couldn't upload this room image. Please try again."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <PageContainer className="max-w-3xl">
      <PageBanner
        scene="diamond"
        badge="Step 01 • Capture Your Space"
        title="Upload Your Room Photo"
        subtitle="A clear, well-lit photo of your bathroom, kitchen, wall, or floor produces the most accurate photorealistic trial room results."
        heightClass="min-h-[11rem] sm:min-h-[13rem]"
      />

      <Card className="mt-6 shadow-md border-stone-200">
        <CardBody className="space-y-6">
          <div>
            <p className="mb-2 text-sm font-medium text-stone-700">Project Workspace</p>
            {projects === null ? (
              <p className="text-sm text-stone-400">Loading your projects…</p>
            ) : (
              <div className="space-y-3">
                {projects.length > 0 && (
                  <label className="flex items-center gap-2 text-sm text-stone-700">
                    <input
                      type="radio"
                      name="projectMode"
                      checked={projectMode === "existing"}
                      onChange={() => setProjectMode("existing")}
                    />
                    Add to an existing project
                  </label>
                )}
                {projectMode === "existing" && projects.length > 0 && (
                  <select
                    className="w-full rounded-lg border border-stone-300 bg-white px-3.5 py-2.5 text-sm"
                    value={selectedProjectId}
                    onChange={(e) => setSelectedProjectId(e.target.value)}
                    aria-label="Select an existing project"
                  >
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                )}

                <label className="flex items-center gap-2 text-sm text-stone-700">
                  <input type="radio" name="projectMode" checked={projectMode === "new"} onChange={() => setProjectMode("new")} />
                  Start a new project
                </label>
                {projectMode === "new" && (
                  <Input
                    placeholder="e.g. Master Bathroom Renovation"
                    value={newProjectName}
                    onChange={(e) => setNewProjectName(e.target.value)}
                    aria-label="New project name"
                  />
                )}
              </div>
            )}
          </div>

          <div>
            <p className="mb-2 text-sm font-medium text-stone-700">Room photograph</p>
            <Dropzone
              file={file}
              onFileSelected={handleFileSelected}
              onClear={() => {
                setFile(null);
                setFileError(null);
              }}
              error={fileError}
              disabled={submitting}
            />
          </div>
          <p className="-mt-4 text-xs leading-relaxed text-stone-500">
            For unfinished washrooms, kitchens, or puja spaces, upload a photo showing the target walls or floor. Keep permanent plumbing, doors, and windows in view for accurate in-situ perspective mapping.
          </p>

          {submitError && <ErrorState message={submitError} onRetry={() => setSubmitError(null)} />}

          <Button className="w-full" size="lg" onClick={handleSubmit} disabled={!canSubmit} loading={submitting}>
            {submitting ? "Uploading & Initializing Trial…" : "Analyze Space & Proceed to Tiles →"}
          </Button>
        </CardBody>
      </Card>
    </PageContainer>
  );
}
