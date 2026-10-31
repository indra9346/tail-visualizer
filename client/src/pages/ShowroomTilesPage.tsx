import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ApiClientError, friendlyErrorMessage } from "@/api/client";
import { listMyTiles, setMyTileActive } from "@/api/tiles";
import type { Tile } from "@/api/types";
import { Icon } from "@/components/simple/Icon";
import { IconLink, Screen, bigButton } from "@/components/simple/Flow";
import { useWorkflow } from "@/context/WorkflowContext";
import { cn } from "@/lib/cn";
import { getPublicTileImageUrl } from "@/lib/tileImage";

type Place = "all" | "floor" | "wall";

const PLACES: { id: Place; label: string }[] = [
  { id: "all", label: "All" },
  { id: "floor", label: "Floor tiles" },
  { id: "wall", label: "Wall tiles" },
];

const TAG: Record<Tile["category"], string> = { floor: "Floor", wall: "Wall", both: "Floor + wall" };

/** A plain sentence for the owner: the server's own words for a clear problem, never a technical one. */
function plainError(err: unknown, fallback: string): string {
  if (err instanceof ApiClientError && (err.status >= 500 || err.code === "UNKNOWN_ERROR")) return fallback;
  return friendlyErrorMessage(err, fallback);
}

/** "600x600" -> "600×600", the way sizes are written on boxes. */
function showSize(size: string | null): string | null {
  const s = size?.trim();
  if (!s) return null;
  return s.replace(/\s*[x*×]\s*/gi, "×");
}

function tileInfo(tile: Tile): string {
  const size = showSize(tile.sizeMm);
  const price = tile.pricePerSqft != null ? `₹${tile.pricePerSqft.toLocaleString("en-IN", { maximumFractionDigits: 2 })}/sq ft` : null;
  if (!size && !price) return "No size or price yet";
  return [size, price].filter(Boolean).join(" · ");
}

/** Search by name, size (600x600, 600 x 600, 600×600 all match) or colour. */
function matches(tile: Tile, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const squash = (s: string) => s.toLowerCase().replace(/[×*]/g, "x").replace(/\s+/g, "");
  const qs = squash(q);
  return (
    tile.name.toLowerCase().includes(q) ||
    (tile.colorFamily ?? "").toLowerCase().includes(q) ||
    (qs.length > 0 && squash(tile.sizeMm ?? "").includes(qs))
  );
}

/** The tile's photo, or a plain "No photo" box when there is none or it does not load. */
function TilePhoto({ tile, className }: { tile: Tile; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (!tile.storagePath || failed) {
    return <span className={cn("flex items-center justify-center rounded-xl bg-[#E9ECE6] text-[13px] font-bold text-[#5B665D]", className)}>No photo</span>;
  }
  return <img src={getPublicTileImageUrl(tile.storagePath)} alt="" loading="lazy" onError={() => setFailed(true)} className={cn("block w-full rounded-xl object-cover", className)} />;
}

/** "My tiles": every tile of this showroom (hidden ones too, dimmed at the end), with search and Floor / Wall. */
export function ShowroomTilesPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { selectTile } = useWorkflow();
  const [tiles, setTiles] = useState<Tile[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [place, setPlace] = useState<Place>("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sheetError, setSheetError] = useState<string | null>(null);
  // A tile just saved on Add tile, or just hidden / shown here.
  const [notice, setNotice] = useState<string | null>(() => {
    const added = (location.state as { added?: string } | null)?.added;
    return added ? `"${added}" was added.` : null;
  });
  const opener = useRef<HTMLElement | null>(null);
  const sheetRef = useRef<HTMLDivElement | null>(null);

  function load() {
    setLoadError(null);
    setTiles(null);
    listMyTiles()
      .then(setTiles)
      .catch((err: unknown) => setLoadError(plainError(err, "We could not load your tiles. Check the internet and try again.")));
  }
  useEffect(load, []);

  // The "was added" note is shown once: a reload of this page must not say it again.
  useEffect(() => {
    if ((location.state as { added?: string } | null)?.added) navigate(location.pathname, { replace: true, state: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const shown = useMemo(() => {
    if (!tiles) return [];
    const list = tiles.filter((t) => (place === "all" || t.category === place || t.category === "both") && matches(t, query));
    // Hidden tiles go after the others; otherwise the order stays as saved (newest first).
    return [...list.filter((t) => t.isActive), ...list.filter((t) => !t.isActive)];
  }, [tiles, place, query]);

  const open = tiles?.find((t) => t.id === openId) ?? null;
  const hiddenCount = tiles?.filter((t) => !t.isActive).length ?? 0;

  function openTile(tile: Tile, el: HTMLElement) {
    opener.current = el;
    setSheetError(null);
    setOpenId(tile.id);
  }

  function closeSheet() {
    setOpenId(null);
    setSheetError(null);
    // Back to the tile that was tapped, so a keyboard or screen-reader user does not lose their place.
    opener.current?.focus();
  }

  useEffect(() => {
    if (!openId) return;
    sheetRef.current?.querySelector<HTMLElement>("button, a")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeSheet();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openId]);

  function tryInRoom(tile: Tile) {
    selectTile(tile);
    navigate("/upload");
  }

  async function toggleHidden(tile: Tile) {
    setBusy(true);
    setSheetError(null);
    try {
      const updated = await setMyTileActive(tile.id, !tile.isActive);
      setTiles((prev) => prev?.map((t) => (t.id === updated.id ? updated : t)) ?? prev);
      setNotice(updated.isActive ? `"${updated.name}" is showing again.` : `"${updated.name}" is hidden from customers.`);
      closeSheet();
    } catch (err) {
      // Said inside the sheet; the list itself stays on screen behind it.
      const verb = tile.isActive ? "hide" : "show";
      setSheetError(plainError(err, `Could not ${verb} "${tile.name}". Check the internet and try again.`));
    } finally {
      setBusy(false);
    }
  }

  const countLine =
    tiles === null
      ? " "
      : `${tiles.length} ${tiles.length === 1 ? "tile" : "tiles"} in your showroom${hiddenCount > 0 ? ` · ${hiddenCount} hidden` : ""}`;

  return (
    <Screen className="flex flex-col gap-3 pb-6 lg:max-w-5xl">
      <div className="flex items-center gap-2.5">
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-[28px] font-semibold leading-[34px] text-ink">My tiles</h1>
          <p className="text-[15px] leading-5 text-[#5B665D]">{countLine}</p>
        </div>
        <Link to="/add-tile" className="flex h-[52px] shrink-0 items-center gap-1.5 rounded-2xl bg-stone-900 px-4 text-base font-extrabold text-white shadow-md hover:bg-stone-950">
          <Icon name="plus" />
          Add tile
        </Link>
      </div>

      <label className="flex h-[52px] min-w-0 items-center gap-2 rounded-2xl border-[1.5px] border-[#C9D2C6] bg-white px-3 text-ink focus-within:border-stone-900">
        <Icon name="search" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Name, size or colour"
          aria-label="Search tiles"
          className="min-w-0 flex-1 bg-transparent text-base font-medium text-ink outline-none placeholder:text-[#7A857C]"
        />
      </label>

      <div role="radiogroup" aria-label="Show tiles for" className="flex gap-2">
        {PLACES.map((p) => {
          const on = place === p.id;
          return (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setPlace(p.id)}
              className={cn(
                "h-12 flex-1 rounded-xl border-2 px-2 text-[15px] font-extrabold transition-colors",
                on ? "border-stone-900 bg-stone-900 text-white" : "border-[#C9D2C6] bg-white text-ink hover:border-[#8E9A8F]",
              )}
            >
              {p.label}
            </button>
          );
        })}
      </div>

      {notice && (
        <p role="status" className="flex items-center gap-2 rounded-2xl border-[1.5px] border-hairline bg-sage-200 px-3.5 py-3 text-[15px] font-semibold text-ink">
          <Icon name="check" className="text-[#1F6B43]" />
          <span className="min-w-0 flex-1">{notice}</span>
          <button type="button" onClick={() => setNotice(null)} aria-label="Close message" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl hover:bg-sage-300">
            <Icon name="close" className="h-5 w-5" />
          </button>
        </p>
      )}

      {loadError ? (
        <div role="alert" className="flex flex-col items-center gap-4 rounded-2xl border-[1.5px] border-hairline bg-white px-5 py-8 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#FBEDEA] text-[#A23B2A]">
            <Icon name="alert" />
          </span>
          <p className="text-base font-semibold text-ink">{loadError}</p>
          <button type="button" onClick={load} className={bigButton("secondary", "max-w-xs")}>
            <Icon name="retry" />
            Try again
          </button>
        </div>
      ) : tiles === null ? (
        <div aria-busy="true" aria-label="Loading tiles" className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-2xl border-[1.5px] border-hairline bg-white p-[5px] pb-2">
              <div className="aspect-[5/3] animate-pulse rounded-xl bg-sage-200" />
              <div className="mx-1 mt-2.5 h-4 w-3/4 animate-pulse rounded bg-sage-200" />
              <div className="mx-1 mt-2 h-3 w-1/2 animate-pulse rounded bg-sage-100" />
            </div>
          ))}
        </div>
      ) : tiles.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border-[1.5px] border-hairline bg-white px-5 py-8 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-sage-200 text-ink">
            <Icon name="tiles" className="h-7 w-7" />
          </span>
          <p className="font-display text-2xl font-semibold text-ink">No tiles yet</p>
          <p className="text-base text-[#5B665D]">Add the tiles you sell, with a photo, to try them in rooms.</p>
          <Link to="/add-tile" className={bigButton("primary", "max-w-xs")}>
            <Icon name="plus" />
            Add your first tile
          </Link>
        </div>
      ) : shown.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border-[1.5px] border-hairline bg-white px-5 py-8 text-center">
          <p className="text-base font-semibold text-ink">No tiles match.</p>
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setPlace("all");
            }}
            className={bigButton("secondary", "max-w-xs")}
          >
            Show all tiles
          </button>
        </div>
      ) : (
        <ul aria-label="Tiles" className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
          {shown.map((tile) => (
            <li key={tile.id} className="min-w-0">
              <button
                type="button"
                onClick={(e) => openTile(tile, e.currentTarget)}
                aria-haspopup="dialog"
                className={cn(
                  "block w-full min-w-0 rounded-2xl border-[1.5px] border-hairline bg-white p-[5px] pb-2 text-left transition-colors hover:border-[#8E9A8F]",
                  !tile.isActive && "border-dashed opacity-70",
                )}
              >
                {/* The Floor / Wall tag sits on the photo, so the tile's name gets the whole line. */}
                <span className="relative block">
                  <TilePhoto tile={tile} className="aspect-[5/3]" />
                  <span
                    className={cn(
                      "absolute left-1.5 top-1.5 h-[22px] rounded-full px-2 text-[11px] font-extrabold leading-[22px] shadow-sm",
                      tile.isActive ? "bg-white text-ink" : "bg-[#FBEDEA] text-[#8C2F21]",
                    )}
                  >
                    {tile.isActive ? TAG[tile.category] : "Hidden"}
                  </span>
                </span>
                <b className="line-clamp-2 block px-1 pt-2 text-[15px] leading-[19px] text-ink">{tile.name}</b>
                <span className="block px-1 pt-0.5 text-[13px] leading-[17px] text-[#5B665D]">{tileInfo(tile)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
          <div className="absolute inset-0 bg-[#303B33]/45" aria-hidden="true" onClick={closeSheet} />
          <div
            ref={sheetRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="tile-sheet-title"
            className="relative flex max-h-[90vh] w-full max-w-md flex-col gap-3 overflow-y-auto rounded-t-3xl bg-surface-app p-4 pb-[max(16px,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(48,59,51,0.15)] sm:rounded-3xl"
          >
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <h2 id="tile-sheet-title" className="font-display text-2xl font-semibold leading-[30px] text-ink">
                  {open.name}
                </h2>
                <p className="text-[15px] text-[#5B665D]">
                  {open.isActive ? TAG[open.category] : "Hidden from customers"} · {tileInfo(open)}
                </p>
              </div>
              <IconLink icon="close" label="Close" onClick={closeSheet} />
            </div>
            <TilePhoto tile={open} className="aspect-[16/10] max-h-56 rounded-2xl" />

            {sheetError && (
              <p role="alert" className="flex items-start gap-2 rounded-2xl bg-[#FBEDEA] px-3.5 py-3 text-[15px] font-semibold text-[#8C2F21]">
                <Icon name="alert" className="h-5 w-5" />
                {sheetError}
              </p>
            )}

            {open.isActive ? (
              <button type="button" onClick={() => tryInRoom(open)} className={bigButton("primary")}>
                <Icon name="camera" />
                Try in a room
              </button>
            ) : (
              <p className="text-[15px] text-[#5B665D]">Customers do not see this tile. Show it again to use it in a design.</p>
            )}
            <button type="button" onClick={() => toggleHidden(open)} disabled={busy} aria-busy={busy} className={bigButton("secondary")}>
              <Icon name={open.isActive ? "eyeOff" : "eye"} />
              {busy ? "Saving…" : open.isActive ? "Hide from customers" : "Show again"}
            </button>
          </div>
        </div>
      )}
    </Screen>
  );
}
