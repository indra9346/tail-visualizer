import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";

/**
 * Asks before anything is permanently deleted. `onConfirm` may throw: the dialog stays open and
 * shows the message so nothing looks deleted when it wasn't.
 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Delete",
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't work. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={busy ? () => undefined : onClose} title={title} className="sm:max-w-md">
      <p className="text-sm text-stone-700">{message}</p>
      <p className="mt-2 text-sm font-medium text-red-700">This can't be undone.</p>
      {error && (
        <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-700">
          {error}
        </p>
      )}
      <div className="mt-6 flex justify-end gap-3">
        <Button variant="outline" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button onClick={confirm} loading={busy} className="bg-red-700 hover:bg-red-800">
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
