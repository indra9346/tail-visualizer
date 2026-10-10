import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";
import { motion } from "framer-motion";
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
  const cameraInputRef = useRef<HTMLInputElement>(null);
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
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        className="overflow-hidden rounded-2xl border border-stone-200 bg-white"
      >
        <div className="aspect-[4/3] w-full overflow-hidden bg-stone-100">
          <motion.img
            src={previewUrl}
            alt="Preview of the room you selected to upload"
            className="h-full w-full object-cover"
            initial={{ scale: 1.06 }}
            animate={{ scale: 1 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
          />
        </div>
        <div className="flex items-center justify-between gap-3 p-4">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-stone-900">{file.name}</p>
            <p className="text-xs text-stone-500">{(file.size / (1024 * 1024)).toFixed(1)} MB</p>
          </div>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={disabled}
              className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm font-medium text-stone-700 hover:bg-stone-100 disabled:opacity-50"
            >
              Replace
            </button>
            <button
              type="button"
              onClick={onClear}
              disabled={disabled}
              className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm font-medium text-stone-700 hover:bg-stone-100 disabled:opacity-50"
            >
              Remove
            </button>
          </div>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="sr-only"
          disabled={disabled}
          onChange={(e) => handleFiles(e.target.files)}
        />
        {error && (
          <p className="border-t border-red-100 bg-red-50 px-4 py-2 text-sm text-red-700" role="alert">
            {error}
          </p>
        )}
      </motion.div>
    );
  }

  return (
    <div>
      <motion.div
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
        animate={{ scale: isDragging ? 1.015 : 1 }}
        transition={{ duration: 0.15 }}
        className={cn(
          "flex aspect-[4/3] w-full cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 text-center transition-colors",
          isDragging ? "border-clay-500 bg-clay-50 shadow-lg" : "border-stone-300 bg-stone-50 hover:border-stone-400",
          disabled && "cursor-not-allowed opacity-60",
        )}
      >
        <motion.svg
          width="40"
          height="40"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
          className="text-stone-400"
          animate={isDragging ? { y: -4 } : { y: 0 }}
          transition={{ duration: 0.2 }}
        >
          <path
            d="M12 16V4m0 0L7 9m5-5l5 5M5 20h14"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </motion.svg>
        <div>
          <p className="text-sm font-medium text-stone-900">Drag and drop your room photo, or click to browse</p>
          <p className="mt-1 text-xs text-stone-500">
            A clear, well-lit photo of the whole room produces the best visualization. JPEG, PNG or WebP · up to 10 MB.
          </p>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="sr-only"
          disabled={disabled}
          onChange={(e) => handleFiles(e.target.files)}
        />
      </motion.div>

      {/* A single <input> can't both open the library and force the camera across
          mobile browsers, so a second hidden input with capture="environment"
          backs this button. Harmless on desktop: capture is simply ignored there. */}
      <button
        type="button"
        onClick={() => cameraInputRef.current?.click()}
        disabled={disabled}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-medium text-stone-700 transition-colors hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
          <circle cx="12" cy="13" r="4" />
        </svg>
        Take a Photo
      </button>
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        disabled={disabled}
        onChange={(e) => handleFiles(e.target.files)}
      />

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
