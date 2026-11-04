import { useState } from "react";

// Card behaviour shared by everything that hangs a poster: hovering it or moving keyboard focus into it lifts the poster.
// Spread the result onto the card's motion element; children with "rest" and "lift" variants follow along.
export function useLift() {
  const [focused, setFocused] = useState(false);
  return {
    initial: "rest",
    animate: focused ? "lift" : "rest",
    whileHover: "lift",
    onFocusCapture: () => setFocused(true),
    onBlurCapture: (e) => !e.currentTarget.contains(e.relatedTarget) && setFocused(false),
  };
}
