import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { listProjectRooms, listProjects } from "@/api/projectsRooms";
import { getRoom } from "@/api/rooms";
import { listMyVisualizationsPage } from "@/api/visualizations";
import { friendlyErrorMessage } from "@/api/client";
import type { Project, RoomUpload, Visualization } from "@/api/types";
import { Icon } from "@/components/simple/Icon";
import { Screen, bigButton } from "@/components/simple/Flow";
import { Skeleton } from "@/components/ui/Skeleton";
import { useWorkflow } from "@/context/WorkflowContext";
import { DEFAULT_PROJECT_NAME, SAMPLE_PROJECT_NAME } from "@/lib/customers";
import { cn } from "@/lib/cn";

// ---------- small helpers shared by the Customers and Customer screens ----------

/** The project for photos without a customer name ("My rooms") is shown to the owner as this group. */
export const WALK_IN_NAME = "Walk-in customers";
/** The project for designs tried on a sample room. */
export const SAMPLE_NAME = "Sample rooms";

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.toLowerCase();
export const isWalkIn = (project: Pick<Project, "name">) => sameName(project.name, DEFAULT_PROJECT_NAME);
export const isSample = (project: Pick<Project, "name">) => sameName(project.name, SAMPLE_PROJECT_NAME);
/** Not one person: the walk-in group and the sample rooms. */
export const isGroup = (project: Pick<Project, "name">) => isWalkIn(project) || isSample(project);

/** A project is a customer: its name, or the group name for walk-ins and sample rooms. */
export const groupName = (project: Pick<Project, "name">) =>
  isWalkIn(project) ? WALK_IN_NAME : isSample(project) ? SAMPLE_NAME : project.name.trim() || "Customer";

/** Muted help text on the cream page (#5B665D passes 4.5:1 there; the lighter ink-secondary does not quite). */
export const MUTED = "text-[#5B665D]";

const DAY = 86_400_000;
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
export const time = (iso: string) => {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? 0 : t;
};

/** "Today", "Yesterday", "28 Oct" (plus the year when it is not this year). With `withTime`, today also shows the time. */
export function whenText(iso: string, withTime = false): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const today = startOfDay(new Date());
  const day = startOfDay(d);
  if (day === today) return withTime ? `Today, ${d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}` : "Today";
  if (day === today - DAY) return "Yesterday";
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString("en-IN", sameYear ? { day: "numeric", month: "short" } : { day: "numeric", month: "short", year: "numeric" });
}

/** Runs at most `max` requests at a time, so a long list never fires dozens of requests at once. */
export function createLimiter(max: number) {
  let active = 0;
  const queue: Array<() => void> = [];
  const next = () => {
    if (active >= max) return;
    const job = queue.shift();
    if (!job) return;
    active++;
    job();
  };
  return function run<T>(task: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      queue.push(() => {
        task()
          .then(resolve, reject)
          .finally(() => {
            active--;
            next();
          });
      });
      next();
    });
  };
}

/** A problem in plain words, with one big Try again button. */
export function Problem({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="mt-4 flex flex-col items-center gap-4 rounded-3xl border-[1.5px] border-[#E7C4BC] bg-white px-5 py-7 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[#FBEDEA] text-[#A23B2A]">
        <Icon name="alert" className="h-7 w-7" />
      </span>
      <p className="text-base font-semibold leading-snug text-ink">{message}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className={bigButton("secondary")}>
          <Icon name="retry" />
          Try again
        </button>
      )}
    </div>
  );
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

// ---------- the Customers screen ----------

/** Customers whose rooms are loaded at first, and again each time "Show more" is tapped. */
const PAGE = 15;
/** At most this many of the newest real photos are traced back to their customer, so returning customers rise to the top. */
const RECENT_ROOM_LOOKUPS = 6;

type When = "all" | "today" | "week";
const CHIPS: Array<{ id: When; label: string }> = [
  { id: "all", label: "All" },
  { id: "today", label: "Today" },
  { id: "week", label: "This week" },
];

interface History {
  list: Visualization[];
  hasMore: boolean;
  failed: boolean;
}

interface Row {
  project: Project;
  name: string;
  /** The walk-in group or the sample rooms, not one person. */
  group: "walkIn" | "sample" | null;
  /** undefined = not loaded yet. */
  rooms: RoomUpload[] | "failed" | undefined;
  /** null = not known exactly (only part of the history is loaded). */
  tries: number | null;
  /** Latest thing that happened for this customer (ms). */
  activity: number;
  thumb: string | null;
}

/**
 * Every customer (project) with a photo, how many room photos and tries, and when they were last worked on. Rooms are
 * loaded only for the customers on screen, a few requests at a time.
 */
export function CustomersPage() {
  const { projectId: lastProjectId } = useWorkflow();
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [history, setHistory] = useState<History | null>(null);
  /** Customers who had a real photo made recently (traced from the newest photos); null while looking. */
  const [recentOwners, setRecentOwners] = useState<string[] | null>(null);
  const [rooms, setRooms] = useState<Record<string, RoomUpload[] | "failed">>({});
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [query, setQuery] = useState("");
  const [when, setWhen] = useState<When>("all");
  const [cap, setCap] = useState(PAGE);
  const [shown, setShown] = useState(false);

  const limiter = useRef(createLimiter(5));
  const requested = useRef(new Set<string>());
  /** Bumped on every reload and on leaving the page: answers to older requests are ignored. */
  const generation = useRef(0);

  useEffect(() => {
    const gen = ++generation.current;
    const live = () => gen === generation.current;
    requested.current = new Set();
    setProjects(null);
    setHistory(null);
    setRecentOwners(null);
    setRooms({});
    setShown(false);
    setError(null);

    Promise.all([
      listProjects(),
      listMyVisualizationsPage().then(
        (page): History => ({ list: page.visualizations, hasMore: page.hasMore, failed: false }),
        (): History => ({ list: [], hasMore: true, failed: true }),
      ),
    ])
      .then(async ([list, hist]) => {
        if (!live()) return;
        setProjects(list);
        setHistory(hist);
        // A short list loads every customer's rooms anyway; only a long one needs the newest photos traced back.
        if (list.length <= PAGE) return setRecentOwners([]);
        const roomIds = [...new Set(hist.list.map((v) => v.roomUploadId).filter((id): id is string => Boolean(id)))].slice(0, RECENT_ROOM_LOOKUPS);
        const owners = await Promise.all(roomIds.map((id) => limiter.current(() => getRoom(id)).then((r) => r.projectId, () => null)));
        if (live()) setRecentOwners([...new Set(owners.filter((id): id is string => Boolean(id)))]);
      })
      .catch((err: unknown) => {
        if (live()) setError(friendlyErrorMessage(err, "We couldn't load your customers. Check your internet and try again."));
      });

    return () => {
      generation.current++;
    };
  }, [attempt]);

  const rows = useMemo<Row[]>(() => {
    if (!projects) return [];
    const byRoom = new Map<string, Visualization[]>();
    for (const v of history?.list ?? []) {
      if (!v.roomUploadId || v.status === "failed") continue;
      byRoom.set(v.roomUploadId, [...(byRoom.get(v.roomUploadId) ?? []), v]);
    }
    const oldestLoaded = history && history.list.length > 0 ? Math.min(...history.list.map((v) => time(v.createdAt))) : null;
    const historyComplete = Boolean(history && !history.failed && !history.hasMore);

    return projects
      .map((project): Row => {
        const r = rooms[project.id];
        let activity = time(project.createdAt);
        let thumb: string | null = null;
        let tries: number | null = null;
        if (Array.isArray(r)) {
          const vizs = r.flatMap((room) => byRoom.get(room.id) ?? []);
          for (const x of [...r, ...vizs]) activity = Math.max(activity, time(x.createdAt));
          const newest = <T extends { createdAt: string }>(list: T[]) => [...list].sort((a, b) => time(b.createdAt) - time(a.createdAt))[0];
          const result = newest(vizs.filter((v) => v.status === "completed" && v.resultImageUrl));
          thumb = result?.resultImageUrl ?? newest(r.filter((room) => room.imageUrl))?.imageUrl ?? null;
          // Every try of a room is newer than the room photo: the count is exact when the loaded history reaches back that far.
          const exact = historyComplete || (history !== null && !history.failed && oldestLoaded !== null && r.every((room) => time(room.createdAt) >= oldestLoaded));
          tries = exact ? vizs.length : null;
        }
        return { project, name: groupName(project), group: isWalkIn(project) ? "walkIn" : isSample(project) ? "sample" : null, rooms: r, tries, activity, thumb };
      })
      .sort((a, b) => b.activity - a.activity || a.name.localeCompare(b.name));
  }, [projects, history, rooms]);

  const q = query.trim().toLowerCase();
  const visible = useMemo(() => {
    const today = startOfDay(new Date());
    const from = when === "today" ? today : when === "week" ? today - 6 * DAY : -Infinity;
    return rows.filter((r) => r.activity >= from && (!q || r.name.toLowerCase().includes(q) || r.project.name.toLowerCase().includes(q)));
  }, [rows, q, when]);

  // Load the rooms of the customers on screen (plus the ones worked on most recently), a few at a time.
  const wanted = useMemo(() => {
    if (!projects || recentOwners === null) return [];
    const known = new Set(projects.map((p) => p.id));
    const ids = [...visible.slice(0, cap).map((r) => r.project.id), ...recentOwners, ...(lastProjectId ? [lastProjectId] : [])];
    return [...new Set(ids.filter((id) => known.has(id)))];
  }, [projects, recentOwners, visible, cap, lastProjectId]);

  useEffect(() => {
    const gen = generation.current;
    for (const id of wanted) {
      if (requested.current.has(id)) continue;
      requested.current.add(id);
      limiter.current(() => listProjectRooms(id)).then(
        (list) => gen === generation.current && setRooms((prev) => ({ ...prev, [id]: list })),
        () => gen === generation.current && setRooms((prev) => ({ ...prev, [id]: "failed" })),
      );
    }
  }, [wanted]);

  // The list appears once the first customers are filled in, so rows do not jump around while the owner looks.
  const settled = projects !== null && history !== null && recentOwners !== null && wanted.every((id) => rooms[id] !== undefined);
  useEffect(() => {
    if (settled) setShown(true);
  }, [settled]);
  const ready = shown || settled;

  const people = projects?.filter((p) => !isGroup(p)).length ?? 0;
  const filtering = q !== "" || when !== "all";

  return (
    <Screen>
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="font-display text-[28px] font-semibold leading-[34px] text-ink">Customers</h1>
        {projects && people > 0 && <span className={cn("text-[15px]", MUTED)}>{plural(people, "person", "people")}</span>}
      </div>

      {error ? (
        <Problem message={error} onRetry={() => setAttempt((n) => n + 1)} />
      ) : !ready ? (
        <div className="mt-3 flex flex-col gap-2" aria-busy="true">
          <span className="sr-only">Loading customers</span>
          <Skeleton className="h-[54px] w-full rounded-2xl" />
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-[80px] w-full rounded-2xl" />
          ))}
        </div>
      ) : projects && projects.length === 0 ? (
        <div className="mt-4 flex flex-col items-center rounded-3xl border-[1.5px] border-hairline bg-white px-5 py-8 text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-sage-200 text-ink">
            <Icon name="users" className="h-8 w-8" />
          </span>
          <h2 className="mt-3 font-display text-2xl font-semibold text-ink">No customers yet</h2>
          <p className={cn("mt-1 text-base leading-snug", MUTED)}>Take a photo of a customer's room. Every customer will show here.</p>
          <Link to="/upload" className={bigButton("primary", "mt-5")}>
            <Icon name="camera" />
            New design
          </Link>
        </div>
      ) : (
        <>
          <div className="mt-3 flex h-[54px] items-center rounded-2xl border-[1.5px] border-[#C9D2C6] bg-white pr-1 text-ink focus-within:border-stone-900">
            <label className="flex h-full min-w-0 flex-1 items-center gap-2.5 pl-3.5">
              <Icon name="search" />
              <span className="sr-only">Search by customer name</span>
              <input
                type="search"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setCap(PAGE);
                }}
                placeholder="Customer name"
                autoComplete="off"
                className="h-full min-w-0 flex-1 bg-transparent text-[17px] font-medium text-ink outline-none placeholder:text-[#5B665D] [&::-webkit-search-cancel-button]:hidden"
              />
            </label>
            {query && (
              <button type="button" onClick={() => setQuery("")} aria-label="Clear search" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-ink hover:bg-sage-100">
                <Icon name="close" className="h-5 w-5" />
              </button>
            )}
          </div>

          <div role="group" aria-label="Show customers from" className="mt-3 flex gap-2 overflow-x-auto pb-1">
            {CHIPS.map((chip) => {
              const on = when === chip.id;
              return (
                <button
                  key={chip.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => {
                    setWhen(chip.id);
                    setCap(PAGE);
                  }}
                  className={cn(
                    "h-12 shrink-0 rounded-full border-[1.5px] px-4 text-[15px] font-semibold transition-colors",
                    on ? "border-stone-900 bg-stone-900 text-white" : "border-[#C9D2C6] bg-white text-ink hover:border-[#8E9A8F]",
                  )}
                >
                  {chip.label}
                </button>
              );
            })}
          </div>

          {visible.length === 0 ? (
            <div className="mt-3 flex flex-col items-center gap-3 rounded-3xl border-[1.5px] border-hairline bg-white px-5 py-7 text-center">
              <Icon name="search" className="h-8 w-8 text-[#5B665D]" />
              <p className="text-base font-semibold text-ink">{q ? `No customer called "${query.trim()}"` : when === "today" ? "No customers today yet" : "No customers this week"}</p>
              {filtering && (
                <button
                  type="button"
                  onClick={() => {
                    setQuery("");
                    setWhen("all");
                  }}
                  className={bigButton("secondary")}
                >
                  <Icon name="users" />
                  Show all customers
                </button>
              )}
            </div>
          ) : (
            <ul className="mt-3 flex flex-col gap-2" aria-label="Customers">
              {visible.slice(0, cap).map((row) => (
                <li key={row.project.id}>
                  <CustomerRow row={row} />
                </li>
              ))}
            </ul>
          )}

          {visible.length > cap && (
            <button type="button" onClick={() => setCap((n) => n + PAGE)} className={bigButton("secondary", "mt-3")}>
              <Icon name="plus" />
              Show more customers
            </button>
          )}
        </>
      )}
      <div className="h-6" />
    </Screen>
  );
}

function CustomerRow({ row }: { row: Row }) {
  const { rooms } = row;
  let summary: string | null;
  if (rooms === undefined) summary = null;
  else if (rooms === "failed") summary = "Tap to see room photos";
  else if (rooms.length === 0) summary = "No room photos yet";
  else {
    const roomsText = plural(rooms.length, "room", "rooms");
    if (row.group === "walkIn") summary = `${roomsText} · no name given`;
    else if (row.tries === null) summary = roomsText;
    else summary = `${roomsText} · ${row.tries === 0 ? "no tries yet" : plural(row.tries, "try", "tries")}`;
  }

  return (
    <Link
      to={`/customers/${row.project.id}`}
      className="flex min-h-[78px] items-center gap-3 rounded-2xl border-[1.5px] border-hairline bg-white py-2.5 pl-2.5 pr-3 text-ink transition-colors hover:border-[#8E9A8F]"
    >
      {row.thumb ? (
        <img src={row.thumb} alt="" loading="lazy" className="h-14 w-14 shrink-0 rounded-xl bg-sage-100 object-cover" />
      ) : (
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-sage-100 text-[#5B665D]">
          <Icon name={row.group === "walkIn" ? "users" : row.group === "sample" ? "image" : "user"} />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-base font-bold leading-5">{row.name}</span>
        {summary === null ? (
          <Skeleton className="mt-1.5 h-3.5 w-32" />
        ) : (
          <span className={cn("block truncate text-[15px] leading-5", MUTED)}>{summary}</span>
        )}
        <span className={cn("block truncate text-[15px] leading-5", MUTED)}>{whenText(new Date(row.activity).toISOString(), true)}</span>
      </span>
      <Icon name="chevron" className="text-[#5B665D]" />
    </Link>
  );
}
