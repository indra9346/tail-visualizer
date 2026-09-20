import type { Project, RoomUpload } from "@/api/types";
import { Card, CardBody } from "@/components/ui/Card";
import { RoomCard } from "./RoomCard";
import { Skeleton } from "@/components/ui/Skeleton";

export function ProjectCard({
  project,
  rooms,
  loadingRooms,
}: {
  project: Project;
  rooms: RoomUpload[] | undefined;
  loadingRooms: boolean;
}) {
  return (
    <Card>
      <CardBody>
        <div className="flex items-center justify-between">
          <h3 className="font-display text-xl text-stone-900">{project.name}</h3>
          <span className="text-xs text-stone-400">Created {new Date(project.createdAt).toLocaleDateString()}</span>
        </div>

        <div className="mt-4">
          {loadingRooms ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="aspect-[4/3] w-full" />
              ))}
            </div>
          ) : !rooms || rooms.length === 0 ? (
            <p className="text-sm text-stone-500">No rooms uploaded to this project yet.</p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {rooms.map((room) => (
                <RoomCard key={room.id} room={room} />
              ))}
            </div>
          )}
        </div>
      </CardBody>
    </Card>
  );
}
