import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { PageContainer } from "@/components/layout/PageContainer";
import { ProjectCard } from "@/components/projects/ProjectCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import { Button } from "@/components/ui/Button";
import { listProjects, listProjectRooms } from "@/api/projectsRooms";
import { friendlyErrorMessage } from "@/api/client";
import type { Project, RoomUpload } from "@/api/types";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { deleteRoom } from "@/api/rooms";
import { deleteProject } from "@/api/projectsRooms";

import { PageBanner } from "@/components/ui/PageBanner";

export function ProjectsPage() {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [roomsByProject, setRoomsByProject] = useState<Record<string, RoomUpload[]>>({});
  const [loadingRoomsFor, setLoadingRoomsFor] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{ kind: "project"; project: Project } | { kind: "room"; room: RoomUpload; projectId: string } | null>(null);

  useEffect(() => {
    load();
  }, []);

  function load() {
    setError(null);
    setProjects(null);
    listProjects()
      .then((list) => {
        setProjects(list);
        setLoadingRoomsFor(new Set(list.map((p) => p.id)));
        list.forEach((p) => {
          listProjectRooms(p.id)
            .then((rooms) => setRoomsByProject((prev) => ({ ...prev, [p.id]: rooms })))
            .catch(() => setRoomsByProject((prev) => ({ ...prev, [p.id]: [] })))
            .finally(() =>
              setLoadingRoomsFor((prev) => {
                const next = new Set(prev);
                next.delete(p.id);
                return next;
              }),
            );
        });
      })
      .catch((err) => setError(friendlyErrorMessage(err, "We couldn't load your projects.")));
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    try {
      if (pendingDelete.kind === "project") {
        await deleteProject(pendingDelete.project.id);
        setProjects((prev) => prev?.filter((p) => p.id !== pendingDelete.project.id) ?? prev);
      } else {
        await deleteRoom(pendingDelete.room.id);
        setRoomsByProject((prev) => ({
          ...prev,
          [pendingDelete.projectId]: (prev[pendingDelete.projectId] ?? []).filter((r) => r.id !== pendingDelete.room.id),
        }));
      }
    } catch (err) {
      throw new Error(friendlyErrorMessage(err, "We couldn't delete that. Please try again."));
    }
  }

  const dialogText =
    pendingDelete?.kind === "project"
      ? `Delete the project "${pendingDelete.project.name}" with all its room photos and every visualization made from them?`
      : "Delete this room photo with its analysis and every visualization made from it?";

  return (
    <PageContainer>
      <PageBanner
        scene="checker"
        badge="Architectural Studio • Trial Rooms"
        title="Your Trial Spaces & Projects"
        subtitle="Manage your room captures, inspect active in-situ transformations, and test new showroom tiles directly in your actual space."
        actions={
          <>
            <Link to="/upload">
              <Button size="lg" className="bg-clay-500 hover:bg-clay-400 text-stone-950 font-semibold shadow-md">
                Visualize a New Room →
              </Button>
            </Link>
            <Link to="/tiles">
              <Button size="lg" variant="outline" className="border-stone-300 bg-white/80 text-stone-900 hover:bg-white">
                Browse Tile Catalog
              </Button>
            </Link>
          </>
        }
      />

      <div className="mt-8 space-y-6">
        {error && <ErrorState message={error} onRetry={load} />}

        {!error && projects === null && (
          <div className="space-y-6">
            {Array.from({ length: 2 }).map((_, i) => (
              <Skeleton key={i} className="h-64 w-full" />
            ))}
          </div>
        )}

        {!error && projects && projects.length === 0 && (
          <EmptyState
            title="No projects yet"
            description="Upload your first room photo to start visualizing tiles in your actual space."
            action={
              <Link to="/upload">
                <Button>Visualize My Room</Button>
              </Link>
            }
          />
        )}

        {!error &&
          projects?.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              rooms={roomsByProject[project.id]}
              loadingRooms={loadingRoomsFor.has(project.id)}
              onDeleteProject={(p) => setPendingDelete({ kind: "project", project: p })}
              onDeleteRoom={(room) => setPendingDelete({ kind: "room", room, projectId: project.id })}
            />
          ))}
      </div>
      <ConfirmDialog
        open={pendingDelete !== null}
        title={pendingDelete?.kind === "project" ? "Delete project?" : "Delete room photo?"}
        message={dialogText}
        confirmLabel={pendingDelete?.kind === "project" ? "Delete project" : "Delete room"}
        onConfirm={confirmDelete}
        onClose={() => setPendingDelete(null)}
      />
    </PageContainer>
  );
}
