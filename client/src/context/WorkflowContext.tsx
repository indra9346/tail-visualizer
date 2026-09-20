import { createContext, useContext, useCallback, useMemo, useState, type ReactNode } from "react";
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

  const persist = useCallback((next: WorkflowState) => {
    setState(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // best-effort only — the app still works from in-memory state if storage is unavailable
    }
  }, []);

  const setProject = useCallback((projectId: string) => persist({ ...state, projectId }), [state, persist]);
  const setRoom = useCallback(
    (roomUploadId: string) => persist({ ...state, roomUploadId, analysis: null, selectedTile: null, selectedSurfaces: [] }),
    [state, persist],
  );
  const setAnalysis = useCallback((analysis: RoomAnalysis) => persist({ ...state, analysis }), [state, persist]);
  const selectTile = useCallback(
    (tile: Tile) => {
      const defaultSurfaces: SurfaceType[] = tile.category === "both" ? ["floor", "wall"] : [tile.category];
      persist({ ...state, selectedTile: tile, selectedSurfaces: defaultSurfaces });
    },
    [state, persist],
  );
  const setSurfaces = useCallback((selectedSurfaces: SurfaceType[]) => persist({ ...state, selectedSurfaces }), [state, persist]);
  const reset = useCallback(() => {
    persist({ projectId: null, roomUploadId: null, analysis: null, selectedTile: null, selectedSurfaces: [] });
  }, [persist]);

  const value = useMemo(
    () => ({ ...state, setProject, setRoom, setAnalysis, selectTile, setSurfaces, reset }),
    [state, setProject, setRoom, setAnalysis, selectTile, setSurfaces, reset],
  );

  return <WorkflowContext.Provider value={value}>{children}</WorkflowContext.Provider>;
}

export function useWorkflow(): WorkflowContextValue {
  const ctx = useContext(WorkflowContext);
  if (!ctx) throw new Error("useWorkflow must be used within WorkflowProvider");
  return ctx;
}
