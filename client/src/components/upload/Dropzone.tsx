import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";
import { SUPPORTED_IMAGE_TYPES } from "@/api/rooms";
import { cn } from "@/lib/cn";

interface DropzoneProps {
  file: File | null;
  onFileSelected: (file: File) => void;
  onClear: () => void;
  error: string | null;
  disabled?: boolean;
}

export function Dropzone({ file, onFileSelected, onClear, error, disabled }: DropzoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const previewUrl = usePreviewUrl(file);

  const handleFiles = useCallback(
    (files: FileList | null) => {
      const selected = files?.[0];
      if (!selected) return;
      onFileSelected(selected);
    },
    [onFileSelected],
  );

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(false);
    if (disabled) return;
    handleFiles(e.dataTransfer.files);
  }

  if (file && previewUrl) {
    return (
      <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
        <div className="aspect-[4/3] w-full overflow-hidden bg-stone-100">
          <img src={previewUrl} alt="Preview of the room you selected to upload" className="h-full w-full object-cover" />
        </div>
        <div className="flex items-center justify-between gap-3 p-4">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-stone-900">{file.name}</p>
            <p className="text-xs text-stone-500">{(file.size / (1024 * 1024)).toFixed(1)} MB</p>
          </div>
          <button
            type="button"
            onClick={onClear}
            disabled={disabled}
            className="shrink-0 rounded-lg border border-stone-300 px-3 py-1.5 text-sm font-medium text-stone-700 hover:bg-stone-100 disabled:opacity-50"
          >
            Remove
          </button>
        </div>
        {error && (
          <p className="border-t border-red-100 bg-red-50 px-4 py-2 text-sm text-red-700" role="alert">
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        aria-label="Upload a photo of your room"
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
        }}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={onDrop}
        className={cn(
          "flex aspect-[4/3] w-full cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 text-center transition-colors",
          isDragging ? "border-clay-500 bg-clay-50" : "border-stone-300 bg-stone-50 hover:border-stone-400",
          disabled && "cursor-not-allowed opacity-60",
        )}
      >
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="text-stone-400">
          <path
            d="M12 16V4m0 0L7 9m5-5l5 5M5 20h14"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <div>
          <p className="text-sm font-medium text-stone-900">Drag and drop your room photo, or click to browse</p>
          <p className="mt-1 text-xs text-stone-500">
            A clear, well-lit photo of the whole room produces the best visualization. JPEG, PNG or WebP · up to 10 MB.
          </p>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept={SUPPORTED_IMAGE_TYPES.join(",")}
          className="sr-only"
          disabled={disabled}
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>
      {error && (
        <p className="mt-2 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function usePreviewUrl(file: File | null): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!file) {
      setUrl(null);
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  return url;
}
