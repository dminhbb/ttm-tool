/**
 * The bottom-right corner of the screen, shared by the notices that pop up there (owner 2026-11-17): a notice that may
 * appear there ("My assigned epics — Bạn có n epic được giao task!", AssignedEpicsNotice) claims the corner from the
 * moment it starts checking until it is gone, and the "Float message" placed bottom-right waits until no claim is left
 * — it shows AFTER the notice instead of on top of it. A tiny in-memory store (one browser tab), no React import, so the
 * rules can be tested.
 */

const claims = new Set<string>();
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

/** Claims the corner under `owner`; returns the release function (safe to call more than once). */
export function claimBottomRightSlot(owner: string): () => void {
  claims.add(owner);
  emit();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    claims.delete(owner);
    emit();
  };
}

export function isBottomRightSlotBusy(): boolean {
  return claims.size > 0;
}

/** useSyncExternalStore-compatible subscription. */
export function subscribeBottomRightSlot(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
