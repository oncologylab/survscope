import { ENDPOINTS } from "./types";
import type { Endpoint, SurvivalAnalysis } from "./types";
import type {
  Annotation,
  ElementStyle,
  FigureSettings,
  TextRun,
} from "./figure";

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}
export const styleKey = (id: string) =>
  id.startsWith("label.") ? id.split(".").slice(0, 2).join(".") : id;
export function objectStyle(
  settings: FigureSettings,
  id: string,
): ElementStyle {
  const a = settings.annotations.find((a) => `annotation.${a.id}` === id);
  return {
    ...(a ? { fontSize: a.fontSize, color: a.color } : {}),
    ...settings.elements[styleKey(id)],
  };
}
export function isText(id: string, settings: FigureSettings) {
  return (
    /^(title|source|grouping|xlabel|ylabel|label)(\.|$)/.test(id) ||
    settings.annotations.some(
      (a) => `annotation.${a.id}` === id && a.kind === "text",
    )
  );
}
export function parentId(id: string): string | null {
  const ep = id.split(".").at(-1) as Endpoint;
  return ENDPOINTS.includes(ep) && !id.startsWith("panel.")
    ? `panel.${ep}`
    : null;
}
export function locked(settings: FigureSettings, id: string): boolean {
  return !!(
    objectStyle(settings, id).locked ||
    (parentId(id) && settings.elements[parentId(id)!]?.locked)
  );
}
export function roots(ids: string[], settings: FigureSettings): string[] {
  return [...new Set(ids)].filter(
    (id) =>
      !locked(settings, id) &&
      !id.startsWith("curve.") &&
      !id.startsWith("label.") &&
      !ids.includes(parentId(id) ?? ""),
  );
}
export function clampMovement(
  settings: FigureSettings,
  ids: string[],
  dx: number,
  dy: number,
) {
  for (const id of ids.filter((id) => id.startsWith("panel."))) {
    const b = settings.panels[id.split(".")[1] as Endpoint];
    dx = Math.max(
      -b.x * settings.widthIn * 72,
      Math.min((1 - b.x - b.width) * settings.widthIn * 72, dx),
    );
    dy = Math.max(
      -b.y * settings.heightIn * 72,
      Math.min((1 - b.y - b.height) * settings.heightIn * 72, dy),
    );
  }
  return { dx, dy };
}
export function moveObjects(
  settings: FigureSettings,
  ids: string[],
  dx: number,
  dy: number,
): FigureSettings {
  const next = structuredClone(settings),
    w = settings.widthIn * 72,
    h = settings.heightIn * 72;
  const selected = roots(ids, settings);
  ({ dx, dy } = clampMovement(settings, selected, dx, dy));
  for (const id of selected) {
    if (id.startsWith("panel.")) {
      const box = next.panels[id.split(".")[1] as Endpoint];
      box.x = Math.max(0, Math.min(1 - box.width, box.x + dx / w));
      box.y = Math.max(0, Math.min(1 - box.height, box.y + dy / h));
    } else if (id.startsWith("annotation.")) {
      const a = next.annotations.find((a) => `annotation.${a.id}` === id);
      if (a) {
        a.x += dx / w;
        a.x2 += dx / w;
        a.y += dy / h;
        a.y2 += dy / h;
      }
    } else {
      const s = (next.elements[id] ??= {});
      s.dx = (s.dx ?? 0) + dx;
      s.dy = (s.dy ?? 0) + dy;
    }
  }
  return next;
}
export function objectIds(
  settings: FigureSettings,
  analysis: SurvivalAnalysis,
) {
  return [
    "title",
    "source",
    "label.low",
    "label.high",
    ...(analysis.grouping.kind === "median" ? [] : ["grouping"]),
    ...settings.endpoints.flatMap((ep) => [
      `panel.${ep}`,
      `title.${ep}`,
      `xlabel.${ep}`,
      `ylabel.${ep}`,
      `legend.${ep}`,
      `statistics.${ep}`,
      `curve.low.${ep}`,
      `curve.high.${ep}`,
    ]),
    ...settings.annotations.map((a) => `annotation.${a.id}`),
  ];
}
export function objectBounds(svg: SVGSVGElement, id: string): Bounds | null {
  const node = [
    ...svg.querySelectorAll<SVGGraphicsElement>("[data-element]"),
  ].find((n) => n.dataset.element === id);
  const matrix = svg.getScreenCTM();
  if (!node || !matrix) return null;
  return nodeBounds(node, matrix.inverse());
}
export function nodeBounds(node: SVGGraphicsElement, inv: DOMMatrix): Bounds {
  const rect = node.getBoundingClientRect();
  const a = new DOMPoint(rect.left, rect.top).matrixTransform(inv),
    b = new DOMPoint(rect.right, rect.bottom).matrixTransform(inv);
  return { x: a.x, y: a.y, width: b.x - a.x, height: b.y - a.y };
}
export function unionBounds(boxes: Bounds[]): Bounds | null {
  if (!boxes.length) return null;
  const x = Math.min(...boxes.map((b) => b.x)),
    y = Math.min(...boxes.map((b) => b.y));
  return {
    x,
    y,
    width: Math.max(...boxes.map((b) => b.x + b.width)) - x,
    height: Math.max(...boxes.map((b) => b.y + b.height)) - y,
  };
}
export function updateText(
  settings: FigureSettings,
  id: string,
  runs: TextRun[],
): FigureSettings {
  const next = structuredClone(settings),
    value = runs.map((r) => r.text).join("");
  const key = styleKey(id),
    style = (next.elements[key] ??= {});
  style.runs = runs;
  if (id === "label.low" || id === "label.high")
    next[id === "label.low" ? "lowLabel" : "highLabel"] = value;
  else if (id.startsWith("annotation.")) {
    const a = next.annotations.find((a) => `annotation.${a.id}` === id);
    if (a) a.text = value;
  } else style.text = value;
  return next;
}
export function newAnnotation(
  kind: Annotation["kind"],
  x: number,
  y: number,
  x2 = x + 0.2,
  y2 = y + 0.05,
): Annotation {
  return {
    id: crypto.randomUUID(),
    kind,
    text: kind === "text" ? "Text" : "",
    x,
    y,
    x2,
    y2,
    color: "#111111",
    fontSize: 10,
    lineWidth: 1.2,
  };
}
export function alignObjects(
  settings: FigureSettings,
  ids: string[],
  boxes: Map<string, Bounds>,
  action: string,
  artboard: boolean,
): FigureSettings {
  const movable = roots(ids, settings).filter((id) => boxes.has(id));
  const total = artboard
    ? {
        x: 0,
        y: 0,
        width: settings.widthIn * 72,
        height: settings.heightIn * 72,
      }
    : unionBounds(movable.map((id) => boxes.get(id)!));
  if (!total) return settings;
  let next = settings;
  if (action.startsWith("distribute")) {
    if (movable.length < 3) return next;
    const horizontal = action === "distribute-x",
      axis = horizontal ? "x" : "y",
      dim = horizontal ? "width" : "height";
    const ordered = [...movable].sort(
      (a, b) => boxes.get(a)![axis] - boxes.get(b)![axis],
    );
    const gap =
      (total[dim] - ordered.reduce((sum, id) => sum + boxes.get(id)![dim], 0)) /
      (ordered.length - 1);
    let at = total[axis];
    for (const id of ordered) {
      const b = boxes.get(id)!;
      next = moveObjects(
        next,
        [id],
        horizontal ? at - b.x : 0,
        horizontal ? 0 : at - b.y,
      );
      at += b[dim] + gap;
    }
  } else
    for (const id of movable) {
      const b = boxes.get(id)!;
      const dx =
        action === "left"
          ? total.x - b.x
          : action === "center"
            ? total.x + total.width / 2 - b.x - b.width / 2
            : action === "right"
              ? total.x + total.width - b.x - b.width
              : 0;
      const dy =
        action === "top"
          ? total.y - b.y
          : action === "middle"
            ? total.y + total.height / 2 - b.y - b.height / 2
            : action === "bottom"
              ? total.y + total.height - b.y - b.height
              : 0;
      next = moveObjects(next, [id], dx, dy);
    }
  return next;
}
