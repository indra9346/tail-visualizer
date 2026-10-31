import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { deleteProject, listProjectRooms, listProjects } from "@/api/projectsRooms";
import { deleteRoom } from "@/api/rooms";
import { getRoomVisualizations } from "@/api/visualizations";
import { ApiClientError, friendlyErrorMessage } from "@/api/client";
import type { Project, RoomUpload, Visualization } from "@/api/types";
import { Icon } from "@/components/simple/Icon";
import { IconLink, Screen, bigButton } from "@/components/simple/Flow";
import { Skeleton } from "@/components/ui/Skeleton";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { clearQuickDraft } from "@/lib/quickDesign";
import { cn } from "@/lib/cn";
import { MUTED, Problem, createLimiter, groupName, isSample, isWalkIn, time, whenText } from "@/pages/CustomersPage";

/** Room photos whose tries are loaded at first, and again each time "Show more" is tapped. */
const ROOMS_PAGE = 8;

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const newestFirst = <T extends { createdAt: string }>(list: T[]) => [...list].sort((a, b) => time(b.createdAt) - time(a.createdAt));

type Pending = { kind: "customer" } | { kind: "room"; room: RoomUpload } | null;

/**
 * One customer: each room photo with its tries (real photos), New try / Compare, and a big button for another room.
 */
export function CustomerPage() {
  const { projectId = "" } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  /** undefined = loading, null = not found. */
  const [project, setProject] = useState<Project | null | undefined>(undefined);
  const [rooms, setRooms] = useState<RoomUpload[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [tries, setTries] = useState<Record<string, Visualization[] | "failed">>({});
  const [cap, setCap] = useState(ROOMS_PAGE);
  const [pending, setPending] = useState<Pending>(null);

  const limiter = useRef(createLimiter(4));
  const requested = useRef(new Set<string>());
  const generation = useRef(0);

  useEffect(() => {
    const gen = ++generation.current;
    const live = () => gen === generation.current;
    requested.current = new Set();
    setProject(undefined);
    setRooms(null);
    setTries({});
    setError(null);
    setCap(ROOMS_PAGE);

    Promise.all([listProjects(), listProjectRooms(projectId)])
      .then(([list, roomList]) => {
        if (!live()) return;
        setProject(list.find((p) => p.id === projectId) ?? null);
        setRooms(newestFirst(roomList));
      })
      .catch((err: unknown) => {
        if (!live()) return;
        const gone = err instanceof ApiClientError && (err.status === 400 || err.status === 403 || err.status === 404 || err.code === "PROJECT_NOT_FOUND");
        if (gone) setProject(null);
        else setError(friendlyErrorMessage(err, "We couldn't load this customer. Check your internet and try again."));
      });

    return () => {
      generation.current++;
    };
  }, [projectId, attempt]);

  const loadTries = useCallback((roomId: string) => {
    const gen = generation.current;
    requested.current.add(roomId);
    limiter.current(() => getRoomVisualizations(roomId)).then(
      (list) => gen === generation.current && setTries((prev) => ({ ...prev, [roomId]: list })),
      () => gen === generation.current && setTries((prev) => ({ ...prev, [roomId]: "failed" })),
    );
  }, []);

  const shownRooms = useMemo(() => (rooms ?? []).slice(0, cap), [rooms, cap]);
  useEffect(() => {
    for (const room of shownRooms) if (!requested.current.has(room.id)) loadTries(room.id);
  }, [shownRooms, loadTries]);

  function retryRoom(roomId: string) {
    setTries((prev) => {
      const next = { ...prev };
      delete next[roomId];
      return next;
    });
    loadTries(roomId);
  }

  async function confirmDelete() {
    if (!pending) return;
    try {
      if (pending.kind === "customer") {
        await deleteProject(projectId);
        rooms?.forEach((r) => clearQuickDraft(r.id));
        navigate("/customers", { replace: true });
      } else {
        await deleteRoom(pending.room.id);
        clearQuickDraft(pending.room.id);
        setRooms((prev) => prev?.filter((r) => r.id !== pending.room.id) ?? prev);
      }
    } catch (err) {
      throw new Error(friendlyErrorMessage(err, "We couldn't delete that. Please try again."));
    }
  }

  const name = project ? groupName(project) : "";
  const kind: "walkIn" | "sample" | "person" = project && isWalkIn(project) ? "walkIn" : project && isSample(project) ? "sample" : "person";
  const words = {
    walkIn: {
      sub: "Photos without a customer name · ",
      empty: "Take a photo of the room to start.",
      add: { to: `/upload?project=${encodeURIComponent(projectId)}`, label: "New room photo" },
      del: { button: "Delete all walk-in photos", title: "Delete all walk-in photos?", label: "Delete all", what: "Every room photo without a customer name" },
    },
    sample: {
      sub: "Designs tried on sample rooms · ",
      empty: "Try a tile on one of our sample rooms.",
      add: { to: "/upload#samples", label: "Try another sample room" },
      del: { button: "Delete all sample rooms", title: "Delete all sample rooms?", label: "Delete all", what: "Every sample room design" },
    },
    person: {
      sub: "",
      empty: `Take a photo of ${name}'s room to start.`,
      add: { to: `/upload?project=${encodeURIComponent(projectId)}`, label: `New room for ${name}` },
      del: { button: "Delete this customer", title: `Delete ${name}?`, label: "Delete customer", what: `Every room photo of ${name}` },
    },
  }[kind];

  if (project === null) {
    return (
      <Screen>
        <header className="flex items-center gap-2.5 pb-3">
          <IconLink to="/customers" label="Back to customers" />
          <h1 className="font-display text-2xl font-semibold leading-7 text-ink">Customer</h1>
        </header>
        <div role="alert" className="mt-2 flex flex-col items-center gap-3 rounded-3xl border-[1.5px] border-hairline bg-white px-5 py-8 text-center">
          <Icon name="alert" className="h-8 w-8 text-[#A23B2A]" />
          <p className="text-lg font-bold text-ink">We couldn't find this customer</p>
          <p className={cn("text-base", MUTED)}>It may have been deleted.</p>
          <Link to="/customers" className={bigButton("secondary", "mt-2")}>
            <Icon name="users" />
            All customers
          </Link>
        </div>
      </Screen>
    );
  }

  const loading = !error && (project === undefined || rooms === null);

  return (
    <Screen>
      <header className="flex items-center gap-2.5 pb-3">
        <IconLink to="/customers" label="Back to customers" />
        <div className="min-w-0 flex-1">
          {project ? (
            <h1 className="truncate font-display text-2xl font-semibold leading-7 text-ink">{name}</h1>
          ) : (
            <>
              <h1 className="sr-only">Customer</h1>
              <Skeleton className="h-7 w-40" />
            </>
          )}
          {rooms && (
            <p className={cn("text-[15px] leading-5", MUTED)}>
              {words.sub}
              {plural(rooms.length, "room photo", "room photos")}
            </p>
          )}
        </div>
      </header>

      {error ? (
        <Problem message={error} onRetry={() => setAttempt((n) => n + 1)} />
      ) : loading ? (
        <div className="flex flex-col gap-3" aria-busy="true">
          <span className="sr-only">Loading room photos</span>
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-[260px] w-full rounded-[20px]" />
          ))}
        </div>
      ) : (
        <>
          {rooms!.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-[20px] border-[1.5px] border-hairline bg-white px-5 py-7 text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-sage-200 text-ink">
                <Icon name="image" className="h-7 w-7" />
              </span>
              <p className="text-lg font-bold text-ink">No room photos yet</p>
              <p className={cn("text-base", MUTED)}>{words.empty}</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {shownRooms.map((room) => (
                <RoomPhotoCard
                  key={room.id}
                  room={room}
                  tries={tries[room.id]}
                  onRetry={() => retryRoom(room.id)}
                  onDelete={() => setPending({ kind: "room", room })}
                />
              ))}
              {rooms!.length > cap && (
                <button type="button" onClick={() => setCap((n) => n + ROOMS_PAGE)} className={bigButton("secondary")}>
                  <Icon name="plus" />
                  Show more room photos ({rooms!.length - cap})
                </button>
              )}
            </div>
          )}

          <Link to={words.add.to} className={bigButton("primary", "mt-3")}>
            <Icon name={kind === "sample" ? "image" : "camera"} />
            <span className="min-w-0 truncate">{words.add.label}</span>
          </Link>

          <div className="mt-6 flex justify-center pb-6">
            <button
              type="button"
              onClick={() => setPending({ kind: "customer" })}
              className="flex h-12 items-center gap-2 rounded-xl px-3 text-[15px] font-semibold text-[#A23B2A] hover:bg-[#FBEDEA]"
            >
              <Icon name="trash" className="h-5 w-5" />
              {words.del.button}
            </button>
          </div>
        </>
      )}

      <ConfirmDialog
        open={pending !== null}
        title={pending?.kind === "customer" ? words.del.title : "Delete this room photo?"}
        message={
          pending?.kind === "customer"
            ? `${words.del.what} and every real photo made from them will be removed.`
            : "This room photo and every real photo made from it will be removed."
        }
        confirmLabel={pending?.kind === "customer" ? words.del.label : "Delete photo"}
        onConfirm={confirmDelete}
        onClose={() => setPending(null)}
      />
    </Screen>
  );
}

function RoomPhotoCard({
  room,
  tries,
  onRetry,
  onDelete,
}: {
  room: RoomUpload;
  tries: Visualization[] | "failed" | undefined;
  onRetry: () => void;
  onDelete: () => void;
}) {
  const headingId = `room-${room.id}`;
  const list = Array.isArray(tries) ? tries : [];
  // Failed tries are free and show nothing: only real photos (and ones being made) count.
  const counted = list.filter((v) => v.status !== "failed").sort((a, b) => time(a.createdAt) - time(b.createdAt));
  const number = new Map(counted.map((v, i) => [v.id, i + 1]));
  const strip = [...counted].reverse().filter((v) => (v.status === "completed" && v.resultImageUrl) || v.status === "pending" || v.status === "generating");
  const done = counted.filter((v) => v.status === "completed" && v.resultImageUrl).length;

  let summary: string | null = null;
  if (tries === "failed") summary = "Could not load the tries";
  else if (tries) summary = counted.length === 0 ? "No tries yet" : plural(counted.length, "try", "tries");

  const mini = "flex h-12 flex-1 items-center justify-center gap-1.5 rounded-xl border-[1.5px] border-[#C9D2C6] bg-white text-[15px] font-extrabold text-ink hover:border-[#8E9A8F]";

  return (
    <section aria-labelledby={headingId} className="rounded-[20px] border-[1.5px] border-hairline bg-white p-3">
      <div className="flex items-center gap-2.5">
        {room.imageUrl ? (
          <img src={room.imageUrl} alt="" loading="lazy" className="h-[52px] w-[52px] shrink-0 rounded-xl bg-sage-100 object-cover" />
        ) : (
          <span className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-xl bg-sage-100 text-[#5B665D]">
            <Icon name="image" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <h2 id={headingId} className="truncate text-lg font-extrabold leading-[22px] text-ink">
            Room photo · {whenText(room.createdAt)}
          </h2>
          {summary === null ? <Skeleton className="mt-1.5 h-3.5 w-20" /> : <p className={cn("text-[15px] leading-5", MUTED)}>{summary}</p>}
        </div>
        <button
          type="button"
          onClick={onDelete}
          aria-label="Delete this room photo"
          title="Delete this room photo"
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-[#5B665D] hover:bg-[#FBEDEA] hover:text-[#A23B2A]"
        >
          <Icon name="trash" className="h-5 w-5" />
        </button>
      </div>

      {tries === undefined ? (
        <div className="mt-2.5 grid grid-cols-3 gap-2" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="aspect-[9/10] w-full rounded-xl" />
          ))}
        </div>
      ) : tries === "failed" ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-2.5 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-surface-app text-[15px] font-bold text-ink hover:bg-sage-200"
        >
          <Icon name="retry" className="h-5 w-5" />
          Try again
        </button>
      ) : (
        strip.length > 0 && (
          <ul className="mt-2.5 grid grid-cols-3 gap-2" aria-label="Real photos of this room">
            {strip.map((v) => {
              const making = v.status !== "completed";
              return (
                <li key={v.id} className="min-w-0">
                  <Link to={`/result/${v.id}`} className="block text-ink">
                    <span className="relative block aspect-[9/10] w-full overflow-hidden rounded-xl bg-sage-100">
                      {making ? (
                        <span className="flex h-full w-full flex-col items-center justify-center gap-1 text-[13px] font-bold text-[#5B665D]">
                          <Icon name="sparkles" className="h-6 w-6 animate-pulse" />
                          Being made
                        </span>
                      ) : (
                        <img src={v.resultImageUrl!} alt="" loading="lazy" className="h-full w-full object-cover" />
                      )}
                    </span>
                    <span className="mt-1 block truncate text-[13px] font-bold leading-4">Try {number.get(v.id)}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )
      )}

      <div className="mt-2.5 flex gap-2">
        <Link to={`/visualize/${room.id}`} className={mini}>
          <Icon name="retry" className="h-5 w-5" />
          New try
        </Link>
        {done >= 2 && (
          <Link to={`/compare/${room.id}`} className={mini}>
            <Icon name="compare" className="h-5 w-5" />
            Compare
          </Link>
        )}
      </div>
    </section>
  );
}
