import type { RoomAnalysis } from "@/api/types";
import { Badge } from "@/components/ui/Badge";
import { Card, CardBody } from "@/components/ui/Card";

const roomTypeLabel: Record<RoomAnalysis["roomType"], string> = {
  kitchen: "Kitchen",
  bedroom: "Bedroom",
  bathroom: "Bathroom",
  living_room: "Living Room",
  dining_room: "Dining Room",
  balcony: "Balcony",
  corridor: "Corridor",
  other: "Room",
};

const constructionLabel: Record<RoomAnalysis["constructionState"], string> = {
  unfinished: "Unfinished",
  under_construction: "Under Construction",
  finished_needs_renovation: "Finished, needs renovation",
};

const lightingLabel: Record<NonNullable<RoomAnalysis["lighting"]>, string> = {
  natural: "Natural light",
  artificial: "Artificial light",
  mixed: "Mixed lighting",
  low_light: "Low light",
};

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-stone-400">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium text-stone-900">{value}</dd>
    </div>
  );
}

export function AnalysisSummary({ analysis }: { analysis: RoomAnalysis }) {
  return (
    <Card>
      <CardBody className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-display text-2xl text-stone-900">{roomTypeLabel[analysis.roomType]}</h3>
            <p className="mt-1 text-sm text-stone-500">{constructionLabel[analysis.constructionState]}</p>
          </div>
          <Badge tone={analysis.confidence >= 0.7 ? "success" : "warning"}>
            {Math.round(analysis.confidence * 100)}% confidence
          </Badge>
        </div>

        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Fact label="Floor" value={analysis.floorVisible ? analysis.floorCurrentMaterial ?? "Visible" : "Not visible"} />
          <Fact label="Walls" value={analysis.wallVisible ? analysis.wallCurrentMaterial ?? "Visible" : "Not visible"} />
          <Fact label="Lighting" value={analysis.lighting ? lightingLabel[analysis.lighting] : "Unknown"} />
          <Fact label="Doors / Windows" value={`${analysis.doorCount} / ${analysis.windowCount}`} />
        </dl>

        {analysis.fixtures.length > 0 && (
          <div>
            <p className="text-xs uppercase tracking-wide text-stone-400">Fixtures noticed</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {analysis.fixtures.map((f) => (
                <Badge key={f} tone="neutral">
                  {f}
                </Badge>
              ))}
            </div>
          </div>
        )}

        <div>
          <p className="text-xs uppercase tracking-wide text-stone-400">Recommended for this room</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {analysis.recommendedSurfaces.length === 0 ? (
              <span className="text-sm text-stone-500">No surfaces suitable for new tile were identified.</span>
            ) : (
              analysis.recommendedSurfaces.map((s) => (
                <Badge key={s} tone="clay">
                  {s === "floor" ? "Floor tiling" : "Wall tiling"}
                </Badge>
              ))
            )}
          </div>
        </div>

        {analysis.warnings.length > 0 && (
          <div className="rounded-lg bg-amber-50 px-3 py-2.5">
            <p className="text-xs font-medium text-amber-800">Things to keep in mind</p>
            <ul className="mt-1 list-inside list-disc space-y-0.5 text-sm text-amber-700">
              {analysis.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
