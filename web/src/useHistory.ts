import { useRef, useState } from "react";

export function useHistory<T>(initial: T) {
  const [state, setState] = useState({
    present: initial,
    past: [] as T[],
    future: [] as T[],
  });
  const start = useRef<T | null>(null);
  const change = (next: T | ((value: T) => T)) =>
    setState((previous) => {
      const value =
        typeof next === "function"
          ? (next as (value: T) => T)(previous.present)
          : next;
      if (JSON.stringify(value) === JSON.stringify(previous.present))
        return previous;
      return {
        present: value,
        past: [...previous.past, previous.present].slice(-100),
        future: [],
      };
    });
  return {
    value: state.present,
    canUndo: !!state.past.length,
    canRedo: !!state.future.length,
    change,
    replace: (value: T) => {
      start.current = null;
      setState({ present: value, past: [], future: [] });
    },
    begin: () => {
      start.current = state.present;
    },
    preview: (value: T) =>
      setState((previous) => ({ ...previous, present: value })),
    commit: () => {
      const original = start.current;
      start.current = null;
      if (original)
        setState((previous) =>
          JSON.stringify(original) === JSON.stringify(previous.present)
            ? previous
            : {
                ...previous,
                past: [...previous.past, original].slice(-100),
                future: [],
              },
        );
    },
    undo: () =>
      setState((previous) =>
        !previous.past.length
          ? previous
          : {
              present: previous.past.at(-1)!,
              past: previous.past.slice(0, -1),
              future: [previous.present, ...previous.future],
            },
      ),
    redo: () =>
      setState((previous) =>
        !previous.future.length
          ? previous
          : {
              present: previous.future[0],
              past: [...previous.past, previous.present].slice(-100),
              future: previous.future.slice(1),
            },
      ),
  };
}
