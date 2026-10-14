"use client";

import { AlertTriangle } from "lucide-react";
import Modal from "./Modal";
import Button from "./Button";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  destructive?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({ open, title, message, confirmLabel = "Confirm", destructive = true, busy = false, onConfirm, onCancel }: ConfirmDialogProps) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onCancel} disabled={busy}>Cancel</Button>
          <Button variant={destructive ? "danger" : "primary"} onClick={onConfirm} loading={busy}>{confirmLabel}</Button>
        </>
      }
    >
      <div className="flex items-start gap-3 text-sm text-gray-700">
        {destructive && <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />}
        <p>{message}</p>
      </div>
    </Modal>
  );
}
