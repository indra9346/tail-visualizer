import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { listProjects } from "@/api/projectsRooms";
import { getRoom } from "@/api/rooms";
import { listMyVisualizationsPage } from "@/api/visualizations";
import type { Project, RoomType, RoomUpload, Visualization } from "@/api/types";
import { Icon } from "@/components/simple/Icon";
import { GroupLabel, Screen, STEP_NAMES } from "@/components/simple/Flow";
import { Skeleton } from "@/components/ui/Skeleton";
import { useWorkflow } from "@/context/WorkflowContext";
import { chosen, loadQuickDraft, type QuickDraft } from "@/lib/quickDesign";
import { usePhotosLeft } from "@/lib/usePhotosLeft";
import { cn } from "@/lib/cn";
import { customerName } from "@/lib/customers";
import { MUTED, whenText } from "@/pages/CustomersPage";

const SHOP_NAME = "SDS Tiles & Ceramics";

const ROOM_WORDS: Record<RoomType, string> = {
  kitchen: "Kitchen",
  bedroom: "Bedroom",
  bathroom: "Bathroom",
  living_room: "Living room",
  dining_room: "Dining room",
  balcony: "Balcony",
  corridor: "Corridor",
  other: "Room photo",
};

/** Where the owner left an unfinished design: step 2 (nothing chosen yet), 3 (a part still needs a tile) or 4. */
function stoppedAt(draft: QuickDraft): 2 | 3 | 4 {
  if (draft.areas.length === 0) return 2;
  if (draft.areas.some((a) => chosen(a).length === 0)) return 3;
  return 4;
}

/**
 * The owner's home: start a new design, carry on the one left unfinished, the latest real photos, and two tools.
 */
export function HomePage() {
  const { photos } = usePhotosLeft();
  const { roomUploadId, analysis } = useWorkflow();
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [history, setHistory] = useState<Visualization[] | null>(null);
  const [historyFailed, setHistoryFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  /** Room photos looked up for names and the Carry on card; null = could not be loaded (e.g. deleted). */
  const [rooms, setRooms] = useState<Record<string, RoomUpload | null>>({});

  useEffect(() => {
    let live = true;
    listProjects()
      .then((list) => live && setProjects(list))
      .catch(() => live && setProjects([]));
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    let live = true;
    setHistoryFailed(false);
    listMyVisualizationsPage()
      .then((page) => live && setHistory(page.visualizations))
      .catch(() => {
        if (!live) return;
        setHistory(null);
        setHistoryFailed(true);
      });
    return () => {
      live = false;
    };
  }, [attempt]);

  const recent = useMemo(() => (history ?? []).filter((v) => v.status === "completed" && v.resultImageUrl).slice(0, 3), [history]);

  // The unfinished design: the last room photo has a saved draft and no real photo made from it yet.
  const draft = useMemo(() => (roomUploadId ? loadQuickDraft(roomUploadId) : null), [roomUploadId]);
  const historyKnown = history !== null || historyFailed;
  const carryRoomId =
    roomUploadId && draft && historyKnown && !(history ?? []).some((v) => v.roomUploadId === roomUploadId && v.status !== "failed") ? roomUploadId : null;

  const neededRooms = useMemo(() => {
    const ids = recent.map((v) => v.roomUploadId).filter((id): id is string => Boolean(id));
    if (carryRoomId) ids.unshift(carryRoomId);
    return [...new Set(ids)];
  }, [recent, carryRoomId]);

  // Each room is looked up once (at most 4: the Carry on room and the 3 recent photos).
  const requested = useRef(new Set<string>());
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    for (const id of neededRooms) {
      if (requested.current.has(id)) continue;
      requested.current.add(id);
      getRoom(id)
        .then((room) => mounted.current && setRooms((prev) => ({ ...prev, [id]: room })))
        .catch(() => mounted.current && setRooms((prev) => ({ ...prev, [id]: null })));
    }
  }, [neededRooms]);

  const nameOfRoom = (roomId: string | undefined): string | null | undefined => {
    if (!roomId || !(roomId in rooms)) return undefined; // still looking
    const room = rooms[roomId];
    const project = room && projects?.find((p) => p.id === room.projectId);
    if (!projects && room) return undefined;
    return project ? customerName(project.name) : null;
  };

  const carryRoom = carryRoomId ? rooms[carryRoomId] : undefined;
  const carryName = carryRoomId ? nameOfRoom(carryRoomId) : undefined;
  const roomWord = analysis && analysis.roomUploadId === carryRoomId ? ROOM_WORDS[analysis.roomType] : "Room photo";
  const step = draft ? stoppedAt(draft) : 2;

  return (
    <Screen>
      <header className="flex items-center gap-3 pb-3">
        <span
          aria-hidden="true"
          className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-full bg-stone-900 font-display text-[15px] font-semibold text-champagne-400"
        >
          SDS
        </span>
        <div className="min-w-0 flex-1">
          <p className={cn("text-[15px] leading-[18px]", MUTED)}>Namaste</p>
          <p className="truncate text-[17px] font-extrabold leading-[22px] text-ink">{SHOP_NAME}</p>
        </div>
        <Link
          to="/credits"
          className="flex h-12 shrink-0 items-center gap-1.5 rounded-[14px] border-[1.5px] border-hairline bg-white px-3 text-[15px] font-bold text-ink hover:border-[#8E9A8F]"
        >
          <Icon name="camera" className="h-5 w-5" />
          {photos === null ? "Photos left" : `${photos} ${photos === 1 ? "photo" : "photos"} left`}
        </Link>
      </header>

      <section aria-labelledby="new-design-title" className="mt-1 flex flex-col gap-3.5 rounded-3xl bg-stone-900 p-5 text-white">
        <div>
          <p className="text-xs font-extrabold tracking-[0.1em] text-champagne-400">START HERE</p>
          <h1 id="new-design-title" className="mt-1 font-display text-[28px] font-semibold leading-[34px] text-white">
            New design
          </h1>
          <p className="mt-1 text-base leading-[22px] text-sage-200">Take a photo of the customer's room and try any tile on it.</p>
        </div>
        <div className="flex gap-2.5">
          <Link
            to="/upload"
            className="flex min-h-[60px] flex-[1.4] items-center justify-center gap-2 rounded-2xl bg-champagne-400 px-3 text-lg font-extrabold text-ink hover:bg-champagne-500"
          >
            <Icon name="camera" />
            Take photo
          </Link>
          <Link
            to="/upload"
            className="flex min-h-[60px] flex-1 items-center justify-center gap-2 rounded-2xl border-2 border-white/55 px-3 text-[17px] font-bold text-white hover:bg-white/10"
          >
            <Icon name="image" />
            Gallery
          </Link>
        </div>
        <Link to="/upload#samples" className="inline-flex min-h-12 items-center self-start text-[15px] font-semibold text-white underline underline-offset-2">
          No photo? Try a sample room
        </Link>
      </section>

      {carryRoomId && carryRoom && (
        <Link
          to={`/visualize/${carryRoomId}`}
          className="mt-3.5 flex items-center gap-3 rounded-[18px] border-[1.5px] border-hairline bg-white py-2.5 pl-2.5 pr-3 text-ink hover:border-[#8E9A8F]"
        >
          {carryRoom.imageUrl ? (
            <img src={carryRoom.imageUrl} alt="" className="h-16 w-16 shrink-0 rounded-xl bg-sage-100 object-cover" />
          ) : (
            <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-sage-100 text-[#5B665D]">
              <Icon name="image" />
            </span>
          )}
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-[13px] font-extrabold leading-4 tracking-[0.06em] text-[#8A6F3E]">CARRY ON</span>
            <span className="truncate text-[17px] font-extrabold leading-[22px]">{carryName ? `${carryName} · ${roomWord}` : roomWord}</span>
            <span className={cn("text-[15px] leading-5", MUTED)}>
              Stopped at step {step}: {STEP_NAMES[step - 1]}
            </span>
          </span>
          <Icon name="chevron" className="text-[#5B665D]" />
        </Link>
      )}

      <section aria-labelledby="recent-title" className="mt-5">
        <div className="mb-1.5 flex items-center justify-between">
          <GroupLabel id="recent-title">Recent real photos</GroupLabel>
          <Link to="/customers" className="inline-flex min-h-12 items-center px-1 text-[15px] font-bold text-ink underline underline-offset-2">
            See all
          </Link>
        </div>
        {historyFailed ? (
          <div role="alert" className="flex flex-col items-start gap-3 rounded-2xl border-[1.5px] border-hairline bg-white p-4">
            <p className="text-base text-ink">We couldn't load your real photos. Check your internet.</p>
            <button
              type="button"
              onClick={() => setAttempt((n) => n + 1)}
              className="flex h-12 items-center gap-2 rounded-xl border-[1.5px] border-[#C9D2C6] bg-white px-4 text-[15px] font-extrabold text-ink hover:border-[#8E9A8F]"
            >
              <Icon name="retry" className="h-5 w-5" />
              Try again
            </button>
          </div>
        ) : history === null ? (
          <div className="grid grid-cols-3 gap-2.5" aria-busy="true">
            <span className="sr-only">Loading real photos</span>
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-[132px] w-full rounded-[14px] lg:h-[180px]" />
            ))}
          </div>
        ) : recent.length === 0 ? (
          <div className="flex items-center gap-3 rounded-2xl border-[1.5px] border-hairline bg-white p-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-sage-100 text-ink">
              <Icon name="sparkles" />
            </span>
            <p className="text-base leading-snug text-ink">No real photos yet. Start a new design and your photos will show here.</p>
          </div>
        ) : (
          <ul className="grid grid-cols-3 gap-2.5">
            {recent.map((v) => {
              const name = nameOfRoom(v.roomUploadId);
              return (
                <li key={v.id} className="min-w-0">
                  <Link to={`/result/${v.id}`} className="flex min-w-0 flex-col gap-1.5 text-ink">
                    <img
                      src={v.resultImageUrl!}
                      alt={name ? `Real photo for ${name}` : "Real photo"}
                      loading="lazy"
                      className="block h-[132px] w-full rounded-[14px] bg-sage-100 object-cover lg:h-[180px]"
                    />
                    {name === undefined ? (
                      <Skeleton className="h-4 w-3/4" />
                    ) : (
                      <span className="truncate text-[15px] font-bold leading-[18px]">{name ?? "Customer"}</span>
                    )}
                    <span className={cn("-mt-1 truncate text-[13px] leading-4", MUTED)}>{whenText(v.completedAt ?? v.createdAt, true)}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <div className="mt-5 flex gap-2.5 pb-6">
        <Link
          to="/quote"
          className="flex min-h-14 flex-1 items-center justify-center gap-2 rounded-2xl border-[1.5px] border-hairline bg-white px-2 text-center text-base font-bold text-ink hover:border-[#8E9A8F]"
        >
          <Icon name="calculator" />
          Boxes calculator
        </Link>
        <Link
          to="/add-tile"
          className="flex min-h-14 flex-1 items-center justify-center gap-2 rounded-2xl border-[1.5px] border-hairline bg-white px-2 text-center text-base font-bold text-ink hover:border-[#8E9A8F]"
        >
          <Icon name="plus" />
          Add a tile
        </Link>
      </div>
    </Screen>
  );
}
