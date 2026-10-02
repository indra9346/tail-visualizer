import { Link } from "react-router-dom";
import type { RoomUpload } from "@/api/types";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";

const statusTone: Record<RoomUpload["status"], "neutral" | "clay" | "success" | "warning" | "danger"> = {
  uploaded: "neutral",
  analyzing: "clay",
  analyzed: "success",
  failed: "danger",
};

const statusLabel: Record<RoomUpload["status"], string> = {
  uploaded: "Uploaded",
  analyzing: "Analyzing…",
  analyzed: "Analyzed",
  failed: "Analysis failed",
};

export function RoomCard({ room, onDelete }: { room: RoomUpload; onDelete?: (room: RoomUpload) => void }) {
  const href = room.status === "analyzed" ? `/tiles/${room.id}` : `/analysis/${room.id}`;

  return (
    <div className="group relative">
      <Link to={href} className="block" aria-label={`Open room photo from ${new Date(room.createdAt).toLocaleDateString()}`}>
        <Card className="overflow-hidden transition-shadow hover:shadow-lg">
          <div className="aspect-[4/3] w-full bg-stone-100">
            {room.imageUrl ? (
              <img src={room.imageUrl} alt="Uploaded room" className="h-full w-full object-cover" loading="lazy" />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-stone-400">No preview</div>
            )}
          </div>
          <div className="flex items-center justify-between p-4">
            <span className="text-sm text-stone-500">{new Date(room.createdAt).toLocaleDateString()}</span>
            <Badge tone={statusTone[room.status]}>{statusLabel[room.status]}</Badge>
          </div>
        </Card>
      </Link>
      {onDelete && (
        <button
          type="button"
          onClick={() => onDelete(room)}
          aria-label="Delete this room photo"
          title="Delete this room photo"
          className="absolute right-2 top-2 rounded-full bg-white/90 px-2.5 py-1 text-xs font-medium text-red-700 shadow transition hover:bg-red-700 hover:text-white focus-visible:opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
        >
          Delete
        </button>
      )}
    </div>
  );
}
