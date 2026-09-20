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

export function RoomCard({ room }: { room: RoomUpload }) {
  const href = room.status === "analyzed" ? `/tiles/${room.id}` : `/analysis/${room.id}`;

  return (
    <Link to={href} className="block">
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
  );
}
