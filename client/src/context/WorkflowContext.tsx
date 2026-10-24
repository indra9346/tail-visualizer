import { createContext, useContext, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import type { RoomAnalysis, SurfaceType, Tile } from "@/api/types";

/**
 * Holds only IDs and already-fetched, non-sensitive data (never signed
 * URLs) so the room analysis stays a reusable artifact across the whole
 * "select another tile" loop without ever re-triggering POST /analyze.
 * Persisted to localStorage as plain UUIDs/analysis fields only — no
 * secrets, no signed URLs, nothing that expires.
 */
interface WorkflowState {
  projectId: string | null;
  roomUploadId: string | null;
  analysis: RoomAnalysis | null;
  selectedTile: Tile | null;
  selectedSurfaces: SurfaceType[];
}

interface WorkflowContextValue extends WorkflowState {
  setProject: (projectId: string) => void;
  setRoom: (roomUploadId: string) => void;
  setAnalysis: (analysis: RoomAnalysis) => void;
  selectTile: (tile: Tile) => void;
  /** Forget the catalog tile once the Design Studio has placed it, so it is not dropped into every later room. */
  clearSelectedTile: () => void;
  setSurfaces: (surfaces: SurfaceType[]) => void;
  reset: () => void;
}

const STORAGE_KEY = "tile-visualizer:workflow";

function loadInitial(): WorkflowState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) throw new Error("empty");
    const parsed = JSON.parse(raw) as WorkflowState;
    return {
      projectId: parsed.projectId ?? null,
      roomUploadId: parsed.roomUploadId ?? null,
      analysis: parsed.analysis ?? null,
      selectedTile: parsed.selectedTile ?? null,
      selectedSurfaces: parsed.selectedSurfaces ?? [],
    };
  } catch {
    return { projectId: null, roomUploadId: null, analysis: null, selectedTile: null, selectedSurfaces: [] };
  }
}

const WorkflowContext = createContext<WorkflowContextValue | undefined>(undefined);

export function WorkflowProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<WorkflowState>(loadInitial);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // best-effort only — the app still works from in-memory state if storage is unavailable
    }
  }, [state]);

  // Every update builds on the LATEST state (functional updates): two calls in a row, e.g. setRoom then an
  // async setAnalysis, must not undo each other by merging an old copy of the state.
  const setProject = useCallback((projectId: string) => setState((s) => ({ ...s, projectId })), []);
  // A new room drops the previous room's analysis. The tile picked in the catalog ("Try in my space") is kept:
  // it is meant for the room being uploaded now.
  const setRoom = useCallback(
    (roomUploadId: string) => setState((s) => (s.roomUploadId === roomUploadId ? s : { ...s, roomUploadId, analysis: null, selectedSurfaces: [] })),
    [],
  );
  const setAnalysis = useCallback((analysis: RoomAnalysis) => setState((s) => ({ ...s, roomUploadId: analysis.roomUploadId, analysis })), []);
  const selectTile = useCallback((tile: Tile) => {
    const defaultSurfaces: SurfaceType[] = tile.category === "both" ? ["floor", "wall"] : [tile.category];
    setState((s) => ({ ...s, selectedTile: tile, selectedSurfaces: defaultSurfaces }));
  }, []);
  const clearSelectedTile = useCallback(() => setState((s) => (s.selectedTile ? { ...s, selectedTile: null, selectedSurfaces: [] } : s)), []);
  const setSurfaces = useCallback((selectedSurfaces: SurfaceType[]) => setState((s) => ({ ...s, selectedSurfaces })), []);
  const reset = useCallback(() => {
    setState({ projectId: null, roomUploadId: null, analysis: null, selectedTile: null, selectedSurfaces: [] });
  }, []);

  const value = useMemo(
    () => ({ ...state, setProject, setRoom, setAnalysis, selectTile, clearSelectedTile, setSurfaces, reset }),
    [state, setProject, setRoom, setAnalysis, selectTile, clearSelectedTile, setSurfaces, reset],
  );

  return <WorkflowContext.Provider value={value}>{children}</WorkflowContext.Provider>;
}

export function useWorkflow(): WorkflowContextValue {
  const ctx = useContext(WorkflowContext);
  if (!ctx) throw new Error("useWorkflow must be used within WorkflowProvider");
  return ctx;
}
