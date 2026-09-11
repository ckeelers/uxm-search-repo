"use client";

import { markViewed } from "../actions";

/**
 * The outbound "View job" link. Opens the company's posting in a new tab
 * (so the current page/tab is untouched) and, in the background, marks the
 * job as viewed — clearing its "New!" badge.
 */
export function ViewJobLink({
  jobId,
  href,
  className,
  children,
}: {
  jobId: string;
  href: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={className}
      onClick={() => {
        markViewed(jobId).catch(() => {});
      }}
    >
      {children}
    </a>
  );
}
