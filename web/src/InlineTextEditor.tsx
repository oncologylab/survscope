import { useLayoutEffect, useRef, useState } from "react";
import { Schema } from "prosemirror-model";
import { EditorState, TextSelection } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { history, undo, redo } from "prosemirror-history";
import { keymap } from "prosemirror-keymap";
import { baseKeymap, toggleMark } from "prosemirror-commands";
import type { ElementStyle, TextRun } from "./figure";

const schema = new Schema({
  nodes: {
    doc: { content: "paragraph+" },
    paragraph: {
      content: "text*",
      toDOM: () => ["p", 0],
      parseDOM: [{ tag: "p" }, { tag: "div" }],
    },
    text: { group: "inline" },
  },
  marks: {
    bold: {
      toDOM: () => ["strong", 0],
      parseDOM: [{ tag: "strong" }, { tag: "b" }, { style: "font-weight=700" }],
    },
    italic: {
      toDOM: () => ["em", 0],
      parseDOM: [{ tag: "em" }, { tag: "i" }, { style: "font-style=italic" }],
    },
    super: {
      excludes: "sub",
      toDOM: () => ["sup", 0],
      parseDOM: [{ tag: "sup" }],
    },
    sub: {
      excludes: "super",
      toDOM: () => ["sub", 0],
      parseDOM: [{ tag: "sub" }],
    },
  },
});
export interface TextTarget {
  id: string;
  value: string;
  runs?: TextRun[];
  style: ElementStyle;
  matrix: number[];
  x: number;
  y: number;
  width: number;
  fontSize: number;
  family: string;
  anchor: string;
  click?: { left: number; top: number };
}
export function InlineTextEditor({
  target,
  commit,
  scale,
}: {
  target: TextTarget;
  commit: (runs: TextRun[]) => void;
  scale: number;
}) {
  const [active, setActive] = useState<Record<string, boolean>>({});
  const host = useRef<HTMLDivElement>(null),
    view = useRef<EditorView>(),
    done = useRef(false),
    commitRef = useRef(commit);
  commitRef.current = commit;
  function finish() {
    if (!view.current || done.current) return;
    if (view.current.composing) return;
    done.current = true;
    const runs: TextRun[] = [];
    view.current.state.doc.forEach((paragraph, _offset, i) => {
      if (i) runs.push({ text: "\n" });
      paragraph.forEach((node) =>
        runs.push({
          text: node.text ?? "",
          bold: node.marks.some((m) => m.type.name === "bold"),
          italic: node.marks.some((m) => m.type.name === "italic"),
          ...(node.marks.some((m) => m.type.name === "super")
            ? { script: "super" as const }
            : node.marks.some((m) => m.type.name === "sub")
              ? { script: "sub" as const }
              : {}),
        }),
      );
    });
    commitRef.current(runs.length ? runs : [{ text: "" }]);
  }
  useLayoutEffect(() => {
    const svgText = [
      ...document.querySelectorAll<SVGTextElement>("[data-text-id]"),
    ].filter((node) => node.dataset.textId === target.id);
    svgText.forEach((node) => (node.style.visibility = "hidden"));
    const paragraphs: any[][] = [[]];
    for (const run of target.runs ?? [
      {
        text: target.value,
        bold: target.style.bold !== false,
        italic: !!target.style.italic,
      },
    ]) {
      run.text.split("\n").forEach((text, i) => {
        if (i) paragraphs.push([]);
        const marks = [
          (run.bold ?? target.style.bold ?? true)
            ? schema.marks.bold.create()
            : null,
          (run.italic ?? target.style.italic)
            ? schema.marks.italic.create()
            : null,
          run.script ? schema.marks[run.script].create() : null,
        ].filter(Boolean);
        if (text) paragraphs.at(-1)!.push(schema.text(text, marks as any));
      });
    }
    const doc = schema.node(
      "doc",
      null,
      paragraphs.map((nodes) => schema.node("paragraph", null, nodes)),
    );
    const instance = new EditorView(host.current!, {
      state: EditorState.create({
        doc,
        plugins: [
          history(),
          keymap({
            "Mod-z": undo,
            "Shift-Mod-z": redo,
            "Mod-y": redo,
            "Mod-b": toggleMark(schema.marks.bold),
            "Mod-i": toggleMark(schema.marks.italic),
            "Mod-Enter": () => {
              finish();
              return true;
            },
            Escape: () => {
              finish();
              return true;
            },
          }),
          keymap(baseKeymap),
        ],
      }),
      attributes: {
        role: "textbox",
        "aria-label": "Edit plot text",
        "aria-multiline": "true",
        spellcheck: "false",
      },
      dispatchTransaction(tr) {
        const next = instance.state.apply(tr);
        if (
          next.doc.textContent.length + next.doc.childCount - 1 <=
          (target.id.startsWith("label.") ? 40 : 500)
        ) {
          instance.updateState(next);
          const { from, to, empty } = next.selection;
          setActive(
            Object.fromEntries(
              Object.entries(schema.marks).map(([name, mark]) => [
                name,
                empty
                  ? !!mark.isInSet(
                      next.storedMarks ?? next.selection.$from.marks(),
                    )
                  : next.doc.rangeHasMark(from, to, mark),
              ]),
            ),
          );
        }
      },
    });
    view.current = instance;
    instance.focus();
    if (target.click) {
      const pos = instance.posAtCoords(target.click);
      if (pos)
        instance.dispatch(
          instance.state.tr.setSelection(
            TextSelection.create(instance.state.doc, pos.pos),
          ),
        );
    }
    const outside = (event: PointerEvent) => {
      if (
        !(event.target instanceof Element) ||
        event.target.closest(".inline-text-editor, .text-format-toolbar")
      )
        return;
      finish();
    };
    window.addEventListener("pointerdown", outside, true);
    window.addEventListener("survscope:commit-text", finish);
    return () => {
      window.removeEventListener("pointerdown", outside, true);
      window.removeEventListener("survscope:commit-text", finish);
      instance.destroy();
      view.current = undefined;
      svgText.forEach((node) => node.style.removeProperty("visibility"));
    };
  }, [target]);
  const [a, b, c, d, e, f] = target.matrix;
  const factor =
    target.anchor === "middle" ? -0.5 : target.anchor === "end" ? -1 : 0;
  return (
    <>
      <div
        className="text-format-toolbar"
        role="toolbar"
        aria-label="Text formatting"
        onPointerDown={(e) => e.preventDefault()}
      >
        {(
          [
            ["bold", "Bold selection"],
            ["italic", "Italic selection"],
            ["super", "Superscript selection"],
            ["sub", "Subscript selection"],
          ] as const
        ).map(([mark, label]) => (
          <button
            type="button"
            key={mark}
            aria-pressed={!!active[mark]}
            aria-label={label}
            title={label}
            onClick={() => {
              const v = view.current;
              if (v) {
                toggleMark(schema.marks[mark])(v.state, v.dispatch);
                v.focus();
              }
            }}
          >
            {mark === "bold" ? (
              <b>B</b>
            ) : mark === "italic" ? (
              <i>I</i>
            ) : mark === "super" ? (
              <>
                x<sup>2</sup>
              </>
            ) : (
              <>
                x<sub>2</sub>
              </>
            )}
          </button>
        ))}
        <button type="button" onClick={finish}>
          Done
        </button>
        <small>Enter: new line · Esc: finish</small>
      </div>
      <div
        className="inline-text-editor"
        style={{
          transformOrigin: "0 0",
          transform: `matrix(${a * scale},${b * scale},${c * scale},${d * scale},${e * scale},${f * scale})`,
          left: 0,
          top: 0,
        }}
      >
        <div
          ref={host}
          style={{
            position: "absolute",
            left: target.x,
            top: target.y - target.fontSize * 0.91,
            transform: `translateX(${factor * 100}%)`,
            minWidth: Math.max(24, target.width),
            width: "max-content",
            fontSize: target.fontSize,
            fontFamily: target.family,
            color: target.style.color ?? "#111111",
            textAlign:
              target.anchor === "middle"
                ? "center"
                : target.anchor === "end"
                  ? "right"
                  : "left",
          }}
        />
      </div>
    </>
  );
}
