import { useLayoutEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent, RefObject } from "react";
import type { FigureSettings, EditorTool } from "./figure";
import type { Endpoint } from "./types";
import {
  clampMovement,
  isText,
  locked,
  moveObjects,
  objectBounds,
  nodeBounds,
  roots,
  unionBounds,
  newAnnotation,
} from "./editorModel";
import type { Bounds } from "./editorModel";

export interface PlotEditor {
  selection: string[];
  select: (ids: string[]) => void;
  tool: EditorTool;
  snap: boolean;
  change: (settings: FigureSettings) => void;
  editText: (
    node: SVGTextElement,
    click?: { left: number; top: number },
  ) => void;
  zoomAt: (factor: number, x: number, y: number) => void;
}
export function usePlotInteraction(
  svg: RefObject<SVGSVGElement>,
  settings: FigureSettings,
  editor?: PlotEditor,
) {
  const current = useRef({ settings, editor });
  current.current = { settings, editor };
  const [boxes, setBoxes] = useState<{ id: string; box: Bounds }[]>([]);
  const overlay = useRef<SVGGElement>(null),
    marquee = useRef<SVGRectElement>(null),
    guideX = useRef<SVGLineElement>(null),
    guideY = useRef<SVGLineElement>(null);
  const drag = useRef<any>(null),
    raf = useRef(0);
  useLayoutEffect(() => {
    if (!svg.current) return;
    setBoxes(
      (editor?.selection ?? []).flatMap((id) => {
        const box = objectBounds(svg.current!, id);
        return box ? [{ id, box }] : [];
      }),
    );
  }, [editor?.selection.join("|"), settings]);
  useLayoutEffect(() => () => cancelAnimationFrame(raf.current), []);
  function start(event: ReactPointerEvent<SVGSVGElement>) {
    if (!editor || event.button !== 0 || editor.tool === "hand") return;
    const target = event.target as Element;
    const text = target.closest<SVGTextElement>("[data-text-id]");
    const node = target.closest<SVGGElement>("[data-element]");
    const id = node?.dataset.element;
    if (editor.tool === "zoom") {
      event.preventDefault();
      editor.zoomAt(event.altKey ? 0.8 : 1.25, event.clientX, event.clientY);
      return;
    }
    if (id && locked(settings, id)) return;
    if (editor.tool === "type" && text) {
      event.preventDefault();
      editor.editText(text, { left: event.clientX, top: event.clientY });
      return;
    }
    const matrix = svg.current!.getScreenCTM()!,
      inverse = matrix.inverse(),
      p = new DOMPoint(event.clientX, event.clientY).matrixTransform(inverse);
    if (editor.tool === "type") {
      const item = newAnnotation(
        "text",
        p.x / (settings.widthIn * 72),
        p.y / (settings.heightIn * 72),
      );
      editor.change({
        ...settings,
        annotations: [...settings.annotations, item].slice(0, 100),
      });
      editor.select([`annotation.${item.id}`]);
      requestAnimationFrame(() => {
        const n = svg.current?.querySelector<SVGTextElement>(
          `[data-text-id="annotation.${item.id}"]`,
        );
        if (n) current.current.editor?.editText(n);
      });
      return;
    }
    event.preventDefault();
    svg.current?.focus({ preventScroll: true });
    const resize = target.closest("[data-resize]")?.getAttribute("data-resize");
    let ids = editor.selection;
    const draw = editor.tool === "line" || editor.tool === "arrow";
    if (id && !draw && !resize) {
      if (event.shiftKey) {
        ids = ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
      } else if (!ids.includes(id)) ids = [id];
      editor.select(ids);
    } else if (!resize && !event.shiftKey && !draw) {
      ids = [];
      editor.select([]);
    }
    const allNodes = [
      ...svg.current!.querySelectorAll<SVGGraphicsElement>("[data-element]"),
    ];
    const nodes = roots(ids, settings)
      .map((id) => allNodes.find((n) => n.dataset.element === id))
      .filter(Boolean) as SVGGraphicsElement[];
    const bounds = unionBounds(nodes.map((n) => nodeBounds(n, inverse)));
    const lineNode = resize?.startsWith("annotation.")
      ? nodes[0]?.querySelector<SVGLineElement>("line")
      : null;
    const targets = allNodes
      .filter(
        (n) =>
          !nodes.some(
            (selected) =>
              selected === n || selected.contains(n) || n.contains(selected),
          ),
      )
      .map((n) => nodeBounds(n, inverse));
    targets.push({
      x: 0,
      y: 0,
      width: settings.widthIn * 72,
      height: settings.heightIn * 72,
    });
    drag.current = {
      p,
      screenX: event.clientX,
      screenY: event.clientY,
      dx: 0,
      dy: 0,
      moved: false,
      ids,
      original: settings,
      resize,
      lineEndpoint: lineNode
        ? {
            node: lineNode,
            x: Number(lineNode.getAttribute("x2")),
            y: Number(lineNode.getAttribute("y2")),
            handle: target.closest("[data-resize]"),
          }
        : null,
      nodes,
      transforms: nodes.map((n) => n.getAttribute("transform")),
      bounds,
      inverse,
      tolerance: 6 / Math.abs(matrix.a),
      guides: {
        x: [
          ...new Set(
            targets.flatMap((b) => [b.x, b.x + b.width / 2, b.x + b.width]),
          ),
        ].sort((a, b) => a - b),
        y: [
          ...new Set(
            targets.flatMap((b) => [b.y, b.y + b.height / 2, b.y + b.height]),
          ),
        ].sort((a, b) => a - b),
      },
      marquee: !id && !resize && !draw,
      draw: draw ? editor.tool : null,
      additive: event.shiftKey,
    };
  }
  function paint() {
    raf.current = 0;
    const d = drag.current;
    if (!d || !d.moved) return;
    const p = new DOMPoint(d.latestX, d.latestY).matrixTransform(d.inverse);
    d.dx = p.x - d.p.x;
    d.dy = p.y - d.p.y;
    if (d.shiftKey && !d.marquee && !d.resize) {
      if (Math.abs(d.dx) > Math.abs(d.dy)) d.dy = 0;
      else d.dx = 0;
    }
    for (const horizontal of [true, false]) {
      const guide = horizontal ? guideX.current! : guideY.current!;
      let at: number | null = null;
      if (
        current.current.editor?.snap &&
        !d.resize &&
        !d.marquee &&
        !d.draw &&
        d.bounds
      ) {
        const axis = horizontal ? "x" : "y",
          dim = horizontal ? "width" : "height",
          delta = horizontal ? "dx" : "dy",
          positions = d.guides[axis] as number[];
        let nearest = d.tolerance,
          adjustment = 0;
        for (const fraction of [0, 0.5, 1]) {
          const value = d.bounds[axis] + d.bounds[dim] * fraction + d[delta];
          // The geometry is fixed for this gesture. Search cached guide positions
          // without reading layout or scanning every object on each pointer event.
          let low = 0,
            high = positions.length;
          while (low < high) {
            const middle = (low + high) >>> 1;
            if (positions[middle] < value) low = middle + 1;
            else high = middle;
          }
          for (const index of [low - 1, low]) {
            if (index < 0 || index >= positions.length) continue;
            const offset = positions[index] - value;
            if (Math.abs(offset) < nearest) {
              nearest = Math.abs(offset);
              adjustment = offset;
              at = positions[index];
            }
          }
        }
        d[delta] += adjustment;
      }
      if (at !== null) {
        guide.setAttribute(horizontal ? "x1" : "y1", String(at));
        guide.setAttribute(horizontal ? "x2" : "y2", String(at));
      }
      guide.setAttribute("visibility", at === null ? "hidden" : "visible");
    }
    if (!d.resize && !d.marquee && !d.draw)
      Object.assign(
        d,
        clampMovement(
          d.original,
          d.nodes.map((n: SVGGraphicsElement) => n.dataset.element!),
          d.dx,
          d.dy,
        ),
      );
    if (d.marquee || d.draw) {
      const r = marquee.current!;
      r.setAttribute("visibility", "visible");
      r.setAttribute("x", String(Math.min(d.p.x, d.p.x + d.dx)));
      r.setAttribute("y", String(Math.min(d.p.y, d.p.y + d.dy)));
      r.setAttribute("width", String(Math.abs(d.dx)));
      r.setAttribute("height", String(Math.abs(d.dy)));
      return;
    }
    if (d.lineEndpoint) {
      const { node, x, y, handle } = d.lineEndpoint;
      node.setAttribute("x2", String(x + d.dx));
      node.setAttribute("y2", String(y + d.dy));
      handle?.setAttribute("x", String(x + d.dx - 3));
      handle?.setAttribute("y", String(y + d.dy - 3));
      return;
    }
    for (const [i, node] of (d.nodes as SVGGraphicsElement[]).entries()) {
      let transform = `translate(${d.dx} ${d.dy})`;
      if (d.resize && d.bounds) {
        const b = d.bounds;
        const sx = Math.max(0.1, (b.width + d.dx) / Math.max(b.width, 1)),
          sy = Math.max(0.1, (b.height + d.dy) / Math.max(b.height, 1));
        transform = `translate(${b.x} ${b.y}) scale(${sx} ${d.resize.startsWith("panel.") ? sy : sx}) translate(${-b.x} ${-b.y})`;
      }
      node.setAttribute("transform", `${transform} ${d.transforms[i] ?? ""}`);
    }
    overlay.current?.setAttribute(
      "transform",
      d.resize ? "" : `translate(${d.dx} ${d.dy})`,
    );
  }
  function move(event: ReactPointerEvent<SVGSVGElement>) {
    const d = drag.current;
    if (!d) return;
    if (
      Math.hypot(event.clientX - d.screenX, event.clientY - d.screenY) < 3 &&
      !d.moved
    )
      return;
    d.moved = true;
    if (!svg.current?.hasPointerCapture(event.pointerId))
      svg.current?.setPointerCapture(event.pointerId);
    d.latestX = event.clientX;
    d.latestY = event.clientY;
    d.shiftKey = event.shiftKey;
    if (!raf.current) raf.current = requestAnimationFrame(paint);
  }
  function end(event: ReactPointerEvent<SVGSVGElement>) {
    const d = drag.current;
    if (!d) return;
    cancelAnimationFrame(raf.current);
    // Include the final pointer move even if it arrived before the next frame.
    paint();
    if (d.lineEndpoint) {
      const { node, x, y, handle } = d.lineEndpoint;
      node.setAttribute("x2", String(x));
      node.setAttribute("y2", String(y));
      handle?.setAttribute("x", String(x - 3));
      handle?.setAttribute("y", String(y - 3));
    }
    for (const [i, node] of (d.nodes as SVGGraphicsElement[]).entries()) {
      if (d.transforms[i] === null) node.removeAttribute("transform");
      else node.setAttribute("transform", d.transforms[i]);
    }
    overlay.current?.removeAttribute("transform");
    marquee.current?.setAttribute("visibility", "hidden");
    guideX.current?.setAttribute("visibility", "hidden");
    guideY.current?.setAttribute("visibility", "hidden");
    drag.current = null;
    if (svg.current?.hasPointerCapture(event.pointerId))
      svg.current.releasePointerCapture(event.pointerId);
    if (!d.moved || event.type === "pointercancel") return;
    if (d.marquee) {
      const box = {
        x: Math.min(d.p.x, d.p.x + d.dx),
        y: Math.min(d.p.y, d.p.y + d.dy),
        width: Math.abs(d.dx),
        height: Math.abs(d.dy),
      };
      const selected = [
        ...svg.current!.querySelectorAll<SVGGraphicsElement>("[data-element]"),
      ]
        .filter((n) => {
          const id = n.dataset.element!,
            b = objectBounds(svg.current!, id);
          return (
            b &&
            !locked(settings, id) &&
            b.x >= box.x &&
            b.y >= box.y &&
            b.x + b.width <= box.x + box.width &&
            b.y + b.height <= box.y + box.height
          );
        })
        .map((n) => n.dataset.element!);
      editor?.select([...new Set([...(d.additive ? d.ids : []), ...selected])]);
      return;
    }
    if (d.draw) {
      const item = newAnnotation(
        d.draw,
        d.p.x / (settings.widthIn * 72),
        d.p.y / (settings.heightIn * 72),
        (d.p.x + d.dx) / (settings.widthIn * 72),
        (d.p.y + d.dy) / (settings.heightIn * 72),
      );
      editor?.change({
        ...settings,
        annotations: [...settings.annotations, item].slice(0, 100),
      });
      editor?.select([`annotation.${item.id}`]);
      return;
    }
    let next: FigureSettings;
    if (d.resize) {
      next = structuredClone(d.original);
      const id = d.resize as string,
        w = settings.widthIn * 72,
        h = settings.heightIn * 72;
      if (id.startsWith("panel.")) {
        const b = next.panels[id.split(".")[1] as Endpoint];
        b.width = Math.max(
          Math.min(30 / w, 1 - b.x),
          Math.min(1 - b.x, b.width + d.dx / w),
        );
        b.height = Math.max(
          Math.min(30 / h, 1 - b.y),
          Math.min(1 - b.y, b.height + d.dy / h),
        );
      } else if (
        id.startsWith("annotation.") &&
        next.annotations.find((a) => `annotation.${a.id}` === id)?.kind !==
          "text"
      ) {
        const a = next.annotations.find((a) => `annotation.${a.id}` === id)!;
        a.x2 += d.dx / w;
        a.y2 += d.dy / h;
      } else {
        const text = svg.current!.querySelector<SVGTextElement>(
          `[data-text-id="${id}"]`,
        );
        const size = Number(text?.getAttribute("font-size") ?? 10);
        (next.elements[id] ??= {}).fontSize = Math.max(
          4,
          Math.min(
            72,
            (size * (d.bounds.width + d.dx)) / Math.max(1, d.bounds.width),
          ),
        );
      }
    } else next = moveObjects(d.original, d.ids, d.dx, d.dy);
    editor?.change(next);
  }
  const selection = editor && (
    <g data-editor-only="true">
      <g ref={overlay}>
        {boxes.map(({ id, box: b }) => {
          const line = settings.annotations.find(
            (a) => `annotation.${a.id}` === id && a.kind !== "text",
          );
          return (
            <g key={id}>
              <rect
                x={b.x - 3}
                y={b.y - 3}
                width={b.width + 6}
                height={b.height + 6}
                fill="none"
                stroke="#147d77"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
                pointerEvents="none"
              />
              {boxes.length === 1 &&
                !locked(settings, id) &&
                (id.startsWith("panel.") ||
                  id.startsWith("annotation.") ||
                  isText(id, settings)) && (
                  <rect
                    data-resize={id}
                    aria-label={
                      id.startsWith("panel.")
                        ? "Resize panel"
                        : isText(id, settings)
                          ? "Resize text"
                          : "Move line endpoint"
                    }
                    x={
                      id.startsWith("panel.")
                        ? (settings.panels[id.split(".")[1] as Endpoint].x +
                            settings.panels[id.split(".")[1] as Endpoint]
                              .width) *
                            settings.widthIn *
                            72 -
                          3
                        : line
                          ? line.x2 * settings.widthIn * 72 - 3
                          : b.x + b.width
                    }
                    y={
                      id.startsWith("panel.")
                        ? (settings.panels[id.split(".")[1] as Endpoint].y +
                            settings.panels[id.split(".")[1] as Endpoint]
                              .height) *
                            settings.heightIn *
                            72 -
                          3
                        : line
                          ? line.y2 * settings.heightIn * 72 - 3
                          : b.y + b.height
                    }
                    width="6"
                    height="6"
                    fill="#147d77"
                    style={{ cursor: "nwse-resize" }}
                  />
                )}
            </g>
          );
        })}
      </g>
      <rect
        ref={marquee}
        visibility="hidden"
        fill="#147d7718"
        stroke="#147d77"
        pointerEvents="none"
      />
      <line
        ref={guideX}
        visibility="hidden"
        y1="0"
        y2={settings.heightIn * 72}
        stroke="#d9684c"
        vectorEffect="non-scaling-stroke"
        pointerEvents="none"
      />
      <line
        ref={guideY}
        visibility="hidden"
        x1="0"
        x2={settings.widthIn * 72}
        stroke="#d9684c"
        vectorEffect="non-scaling-stroke"
        pointerEvents="none"
      />
    </g>
  );
  return {
    selection,
    events: {
      onPointerDown: start,
      onPointerMove: move,
      onPointerUp: end,
      onPointerCancel: end,
      onDoubleClick: (event: React.MouseEvent<SVGSVGElement>) => {
        const text = (event.target as Element).closest<SVGTextElement>(
          "[data-text-id]",
        );
        const id = (event.target as Element).closest<SVGGElement>(
          "[data-element]",
        )?.dataset.element;
        if (text && (!id || !locked(settings, id)))
          editor?.editText(text, { left: event.clientX, top: event.clientY });
      },
    },
  };
}
