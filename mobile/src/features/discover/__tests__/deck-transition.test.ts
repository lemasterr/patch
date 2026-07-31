import {
  isCurrentTransition,
  transitionDeck,
  type DeckTransitionPhase,
} from "../deck-transition";

describe("Discover deck transition state machine", () => {
  it("keeps a dismiss in its own commit phase until cleanup", () => {
    const phases: DeckTransitionPhase[] = ["idle"];
    phases.push(transitionDeck(phases.at(-1)!, "begin_drag"));
    phases.push(transitionDeck(phases.at(-1)!, "begin_dismiss"));
    phases.push(transitionDeck(phases.at(-1)!, "commit"));
    phases.push(transitionDeck(phases.at(-1)!, "finish"));
    expect(phases).toEqual([
      "idle",
      "dragging",
      "dismissing",
      "committing",
      "idle",
    ]);
  });

  it("does not let a stale animation completion win a newer transition", () => {
    expect(isCurrentTransition(4, 5)).toBe(false);
    expect(isCurrentTransition(5, 5)).toBe(true);
  });
});
