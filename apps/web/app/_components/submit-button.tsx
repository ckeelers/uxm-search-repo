"use client";

import { useFormStatus } from "react-dom";

/**
 * Submit button for a server-action <form>. Disables itself and shows a pending
 * label while the action is in flight, so a slow round-trip doesn't look dead.
 * Must be rendered as a child of the <form>.
 */
export function SubmitButton({
  children,
  className,
  pendingText = "…",
}: {
  children: React.ReactNode;
  className?: string;
  pendingText?: React.ReactNode;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className={`${className ?? ""} disabled:opacity-50`}
    >
      {pending ? pendingText : children}
    </button>
  );
}
