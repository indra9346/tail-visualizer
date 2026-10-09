import { NavLink, type NavLinkProps } from "react-router-dom";
import { useRoomTransition } from "@/components/layout/RoomTransition";

interface DoorNavLinkProps extends NavLinkProps {
  /** Shown on the door overlay while the transition is mid-close, e.g. "CATALOG". */
  roomLabel: string;
}

/**
 * A NavLink that plays the door-closing/opening room transition on an
 * ordinary left-click, and otherwise behaves exactly like NavLink — so
 * ctrl/cmd-click to open in a new tab, middle-click, and keyboard activation
 * all still work natively.
 */
export function DoorNavLink({ roomLabel, onClick, to, ...props }: DoorNavLinkProps) {
  const { go } = useRoomTransition();

  return (
    <NavLink
      to={to}
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented) return;
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        go(typeof to === "string" ? to : String(to), roomLabel);
      }}
      {...props}
    />
  );
}
