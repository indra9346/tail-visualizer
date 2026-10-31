import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import { ActionBar, IconLink, Screen, bigButton } from "@/components/simple/Flow";
import { Icon } from "@/components/simple/Icon";
import { getRoom } from "@/api/rooms";
import { getRoomVisualizations } from "@/api/visualizations";
import { listProjects } from "@/api/projectsRooms";
import { friendlyErrorMessage } from "@/api/client";
import { customerName } from "@/lib/customers";
import { imageFile, saveFile, shareToWhatsApp } from "@/lib/share";
import type { RoomUpload, Visualization } from "@/api/types";

/** Names of the tiles in a result, if the list gave them. */
function tileNames(viz: Visualization): string {
  const names = viz.design?.areas.flatMap((a) => a.tileIds.map((id) => viz.designTiles?.find((t) => t.id === id)?.name).filter(Boolean)) ?? [];
  const unique = [...new Set(names.length > 0 ? names : viz.tile ? [viz.tile.name] : [])];
  return unique.join(" + ");
}

/** Every try of one room side by side, so the customer can choose. */
export function ComparePage() {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const [room, setRoom] = useState<RoomUpload | null>(null);
  const [tries, setTries] = useState<Visualization[] | null>(null);
  const [customer, setCustomer] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const files = useRef<Map<string, File>>(new Map());

  useEffect(() => {
    if (!roomId) return;
    let cancelled = false;
    setError(null);
    Promise.all([getRoom(roomId), getRoomVisualizations(roomId)])
      .then(([r, list]) => {
        if (cancelled) return;
        setRoom(r);
        setTries(list.filter((v) => v.status === "completed" && v.resultImageUrl).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)));
        listProjects()
          .then((projects) => !cancelled && setCustomer(customerName(projects.find((p) => p.id === r.projectId)?.name)))
          .catch(() => undefined);
      })
      .catch((err) => !cancelled && setError(friendlyErrorMessage(err, "We couldn't open the tries for this room.")));
    return () => {
      cancelled = true;
    };
  }, [roomId, attempt]);

  // The photos are fetched ahead, so sharing can start straight after the tap (phones require that).
  useEffect(() => {
    for (const v of tries ?? []) {
      if (files.current.has(v.id) || !v.resultImageUrl) continue;
      imageFile(v.resultImageUrl, `sds-tiles-try-${v.id.slice(0, 8)}`)
        .then((f) => files.current.set(v.id, f))
        .catch(() => undefined);
    }
  }, [tries]);

  async function sendAll() {
    if (!tries || tries.length === 0) return;
    setSending(true);
    setNotice(null);
    try {
      const list = tries.map((v) => files.current.get(v.id)).filter((f): f is File => Boolean(f));
      const text = `SDS Tiles & Ceramics: ${customer && customer !== "Walk-in customer" ? `${customer}, here` : "Here"} are ${tries.length} tile choices for your room: ${tries.map(tileNames).filter(Boolean).join(", ")}.`;
      const outcome = await shareToWhatsApp(list, text);
      if (outcome === "message-only") {
        list.forEach(saveFile);
        if (list.length > 0) setNotice("The photos are saved on this phone. In WhatsApp, pick the customer and attach them.");
      }
    } finally {
      setSending(false);
    }
  }

  return (
    <Screen wide>
      <header className="flex items-center gap-3 pb-3">
        <IconLink onClick={() => navigate(-1)} label="Back" />
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-[22px] font-semibold leading-7 text-ink">Compare tries</h1>
          <p className="truncate text-sm text-ink-secondary">{[customer, tries ? `${tries.length} tr${tries.length === 1 ? "y" : "ies"}` : null].filter(Boolean).join(" · ")}</p>
        </div>
      </header>

      {error ? (
        <ErrorState message={error} onRetry={() => setAttempt((n) => n + 1)} />
      ) : !tries ? (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="aspect-[3/4] w-full" />
          ))}
        </div>
      ) : (
        <>
          {tries.length === 0 && <p className="mb-3 rounded-2xl bg-sage-200 px-4 py-3 text-[15px]">No finished photos for this room yet. Make one to compare.</p>}
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 lg:grid-cols-4">
            {room?.imageUrl && (
              <figure className="m-0">
                <img src={room.imageUrl} alt="Before: the room as it was" className="aspect-[3/4] w-full rounded-2xl bg-stone-200 object-cover" />
                <figcaption className="px-0.5 pt-2 text-[15px] leading-5">
                  <b>Before</b>
                  <span className="block text-ink-secondary">Old tiles</span>
                </figcaption>
              </figure>
            )}
            {tries.map((v, i) => (
              <Link key={v.id} to={`/result/${v.id}`} className="block">
                <img src={v.resultImageUrl!} alt={`Try ${tries.length - i}: ${tileNames(v) || "new tiles"}`} className="aspect-[3/4] w-full rounded-2xl bg-stone-200 object-cover" />
                <span className="block px-0.5 pt-2 text-[15px] leading-5">
                  <b className="line-clamp-2">{tileNames(v) || `Try ${tries.length - i}`}</b>
                  <span className="block text-ink-secondary">{new Date(v.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span>
                </span>
              </Link>
            ))}
          </div>
          {notice && (
            <p className="mt-3 rounded-2xl bg-sage-200 px-3 py-2.5 text-[15px]" role="status">
              {notice}
            </p>
          )}
        </>
      )}

      <ActionBar>
        {tries && tries.length > 0 && (
          <button type="button" onClick={sendAll} disabled={sending} className={bigButton("whatsapp")}>
            <Icon name="whatsapp" />
            {sending ? "Opening WhatsApp…" : `Send ${tries.length === 1 ? "it" : `all ${tries.length}`} on WhatsApp`}
          </button>
        )}
        {roomId && (
          <Link to={`/visualize/${roomId}`} className="mt-2 block py-1.5 text-center text-[15px] font-extrabold underline">
            + Try another tile
          </Link>
        )}
      </ActionBar>
    </Screen>
  );
}
