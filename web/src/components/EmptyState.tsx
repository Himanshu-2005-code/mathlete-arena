import type { ReactNode } from "react";

/** A framed "nothing here yet" panel with an optional call to action. */
export function EmptyState({ title, children, actions }: { title: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="empty-state" role="status">
      <div className="empty-icon" aria-hidden>
        <span />
      </div>
      <h2>{title}</h2>
      <p>{children}</p>
      {actions && <div className="actions">{actions}</div>}
    </div>
  );
}
