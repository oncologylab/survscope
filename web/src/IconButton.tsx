import { useEffect, useId, useRef, useState } from "react";
import type { ButtonHTMLAttributes } from "react";
import { createPortal } from "react-dom";

// Small, local SVG symbols keep controls consistent without another runtime dependency.
const paths = {
  select: "M5 3 19 13 12 14 9 21Z",
  type: "M4 6V3H20V6M12 3V21M8 21H16",
  hand: "M8 12V6a2 2 0 0 1 4 0V11M12 10V4a2 2 0 0 1 4 0V11M16 10V7a2 2 0 0 1 4 0V15c0 5-3 7-7 7-3 0-5-2-6-4l-4-6a2 2 0 0 1 3-2l2 2",
  zoom: "M16 16 22 22M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0",
  line: "M4 20 20 4",
  arrow: "M4 20 20 4M10 4H20V14",
  analysis: "M3 3V21H21M6 7H11V12H15V17H20",
  properties:
    "M3 6H7M11 6H21M3 12H13M17 12H21M3 18H5M9 18H21M7 3V9H11V3ZM13 9V15H17V9ZM5 15V21H9V15Z",
  close: "M6 6 18 18M18 6 6 18",
  new: "M14 2H5V22H19V7ZM14 2V7H19M8 14H16M12 10V18",
  open: "M3 7V4H10L13 7H21V10M3 7V21H19L22 10H7L3 21",
  save: "M3 3H18L21 6V21H3ZM7 3V9H17V3M7 21V14H17V21",
  undo: "M8 4 3 9 8 14M3 9H14a7 7 0 0 1 0 14",
  redo: "M16 4 21 9 16 14M21 9H10a7 7 0 0 0 0 14",
  cite: "M4 5H10V12H4ZM4 12c0 4 2 6 5 7M14 5H20V12H14ZM14 12c0 4 2 6 5 7",
  help: "M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0M9 8a3 3 0 1 1 5 2c-2 1-2 2-2 3M12 17V17.1",
  fit: "M3 9V3H9M15 3H21V9M21 15V21H15M9 21H3V15M7 7H17V17H7Z",
  minus: "M5 12H19",
  plus: "M5 12H19M12 5V19",
  artboard: "M6 2V18H22M2 6H18V22M6 6H18V18H6Z",
  "align-left": "M3 3V21M7 5H20V10H7ZM7 14H15V19H7Z",
  "align-center": "M12 2V22M3 5H21V10H3ZM7 14H17V19H7Z",
  "align-right": "M21 3V21M4 5H17V10H4ZM9 14H17V19H9Z",
  "align-top": "M3 3H21M5 7H10V20H5ZM14 7H19V15H14Z",
  "align-middle": "M2 12H22M5 3H10V21H5ZM14 7H19V17H14Z",
  "align-bottom": "M3 21H21M5 4H10V17H5ZM14 9H19V17H14Z",
  "distribute-x": "M2 3V21M22 3V21M6 7H10V17H6ZM14 5H18V19H14Z",
  "distribute-y": "M3 2H21M3 22H21M7 6H17V10H7ZM5 14H19V18H5Z",
  copy: "M8 8H21V21H8ZM16 8V3H3V16H8",
  paste: "M9 3H15V7H9ZM9 5H5V22H19V5H15M8 12H16M8 16H16",
  duplicate: "M8 8H21V21H8ZM16 8V3H3V16H8M11 14H18M14.5 10.5V17.5",
  front: "M3 3H16V16H3ZM16 8H21V21H8V16",
  back: "M8 8H21V21H8ZM8 16H3V3H16V8",
  delete: "M3 6H21M9 6V3H15V6M6 6 7 21H17L18 6M10 10V17M14 10V17",
  eye: "M2 12c5-10 15-10 20 0-5 10-15 10-20 0M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0",
  "eye-off": "M3 3 21 21M9 5c5-2 10 1 13 7l-3 4M15 19c-5 1-10-1-13-7l3-4",
  lock: "M5 10H19V22H5ZM8 10V6a4 4 0 0 1 8 0V10M12 15V18",
  unlock: "M5 10H19V22H5ZM8 10V6a4 4 0 0 1 8 0M12 15V18",
  reset: "M3 3V10H10M3 10a9 9 0 1 1 0 5",
  bold: "M7 3H13a4.5 4.5 0 0 1 0 9H7ZM7 12H14a4.5 4.5 0 0 1 0 9H7Z",
  italic: "M10 3H20M4 21H14M16 3 8 21",
  super: "M3 10 11 21M11 10 3 21M15 5a3 3 0 0 1 6 0c0 2-6 3-6 6H21",
  sub: "M3 3 11 14M11 3 3 14M15 15a3 3 0 0 1 6 0c0 2-6 3-6 6H21",
  done: "M4 12 9 17 20 6",
  info: "M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0M12 11V17M12 7V7.1",
  grid: "M3 3H10V10H3ZM14 3H21V10H14ZM3 14H10V21H3ZM14 14H21V21H14Z",
  row: "M2 5H7V19H2ZM10 5H15V19H10ZM18 5H23V19H18Z",
  column: "M5 2H19V7H5ZM5 10H19V15H5ZM5 18H19V23H5Z",
  up: "M5 10 12 3 19 10M12 3V21",
} as const;
export type IconName = keyof typeof paths;

export function Icon({ name }: { name: IconName }) {
  return (
    <svg
      className="command-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={paths[name]} />
    </svg>
  );
}

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: IconName;
  label: string;
  description?: string;
  shortcut?: string;
  showLabel?: boolean;
}

export function IconButton({
  icon,
  label,
  description,
  shortcut,
  showLabel,
  className = "",
  ...props
}: Props) {
  const anchor = useRef<HTMLSpanElement>(null);
  const id = useId();
  const [tip, setTip] = useState<{
    x: number;
    y: number;
    below: boolean;
  } | null>(null);
  function show() {
    const rect = anchor.current?.getBoundingClientRect();
    if (!rect) return;
    window.dispatchEvent(new CustomEvent("survscope:tooltip", { detail: id }));
    const below = rect.top < 80;
    setTip({
      x: Math.max(
        128,
        Math.min(window.innerWidth - 128, rect.x + rect.width / 2),
      ),
      y: below ? rect.bottom + 9 : rect.top - 9,
      below,
    });
  }
  useEffect(() => {
    if (!tip) return;
    const hide = () => setTip(null);
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") hide();
    };
    const replace = (event: Event) => {
      if ((event as CustomEvent).detail !== id) hide();
    };
    window.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);
    window.addEventListener("keydown", escape);
    window.addEventListener("survscope:tooltip", replace);
    return () => {
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("resize", hide);
      window.removeEventListener("keydown", escape);
      window.removeEventListener("survscope:tooltip", replace);
    };
  }, [tip, id]);
  return (
    <span
      ref={anchor}
      className="command-wrap"
      onPointerEnter={(e) => {
        if (e.pointerType !== "touch") show();
      }}
      onPointerLeave={() => setTip(null)}
      onFocus={show}
      onBlur={() => setTip(null)}
      onPointerDown={() => setTip(null)}
      onClickCapture={() => setTip(null)}
    >
      <button
        type="button"
        {...props}
        aria-label={label}
        aria-describedby={tip ? id : undefined}
        className={`icon-button ${showLabel ? "labeled-command" : ""} ${className}`}
      >
        <Icon name={icon} />
        {showLabel && <span>{label}</span>}
      </button>
      {tip &&
        createPortal(
          <span
            id={id}
            role="tooltip"
            className="command-tooltip"
            style={{
              left: tip.x,
              top: tip.y,
              transform: `translate(-50%, ${tip.below ? "0" : "-100%"})`,
            }}
          >
            <strong>{label}</strong>
            {shortcut && <kbd>{shortcut}</kbd>}
            {description && <span>{description}</span>}
          </span>,
          document.body,
        )}
    </span>
  );
}
