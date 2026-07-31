export type DeckTransitionPhase =
  "idle" | "dragging" | "dismissing" | "committing" | "restoring";

export type DeckTransitionEvent =
  | "begin_drag"
  | "cancel_drag"
  | "begin_dismiss"
  | "begin_restore"
  | "commit"
  | "finish";

export function transitionDeck(
  phase: DeckTransitionPhase,
  event: DeckTransitionEvent,
): DeckTransitionPhase {
  switch (event) {
    case "begin_drag":
      return phase === "idle" ? "dragging" : phase;
    case "cancel_drag":
      return phase === "dragging" ? "idle" : phase;
    case "begin_dismiss":
      return phase === "dragging" || phase === "idle" ? "dismissing" : phase;
    case "begin_restore":
      return phase === "dragging" || phase === "idle" ? "restoring" : phase;
    case "commit":
      return phase === "dismissing" || phase === "restoring"
        ? "committing"
        : phase;
    case "finish":
      return phase === "committing" || phase === "dragging" ? "idle" : phase;
  }
}

export function isCurrentTransition(token: number, currentToken: number) {
  return token === currentToken;
}
