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

export function ProjectsPage() {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [roomsByProject, setRoomsByProject] = useState<Record<string, RoomUpload[]>>({});
  const [loadingRoomsFor, setLoadingRoomsFor] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

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

  return (
    <PageContainer>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-3xl text-stone-900">Your Projects</h1>
        <Link to="/upload">
          <Button>Visualize a New Room</Button>
        </Link>
      </div>

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
            />
          ))}
      </div>
    </PageContainer>
  );
}
