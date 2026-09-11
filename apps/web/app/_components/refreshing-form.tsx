"use client";

import { useRouter } from "next/navigation";
import { startTransition } from "react";

/**
 * Drop-in replacement for `<form action={serverAction}>`. A form action
 * completing isn't reliably refreshing this app's server-rendered data on
 * its own, so this wrapper explicitly calls router.refresh() once the
 * action settles — the fix for buttons that appeared "stuck" (pending
 * state never clearing, counts not updating) until a manual page reload.
 * The refresh is wrapped in startTransition, which is what router.refresh()
 * expects when triggered from outside a plain top-level click handler.
 */
export function RefreshingForm({
  action,
  className,
  children,
}: {
  action: (formData: FormData) => Promise<void>;
  className?: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  return (
    <form
      className={className}
      action={async (formData: FormData) => {
        await action(formData);
        startTransition(() => {
          router.refresh();
        });
      }}
    >
      {children}
    </form>
  );
}
