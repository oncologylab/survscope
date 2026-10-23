import { ENDPOINTS } from "./types";
import type { Endpoint, SurvivalAnalysis } from "./types";
import { isSharedGroupLabel } from "./plotLabels";
import { editableIds, isTextId } from "./figure";
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
export const panelBox = (settings: FigureSettings, id: string) =>
  settings.panels[id.split(".")[1] as Endpoint];
export function objectStyle(
  settings: FigureSettings,
  id: string,
): ElementStyle {
  const a = settings.annotations.find((a) => `annotation.${a.id}` === id);
  return {
    ...(a ? { fontSize: a.fontSize, color: a.color } : {}),
    ...settings.elements[id],
  };
}
export function isText(id: string, settings: FigureSettings) {
  return (
    isTextId(id) ||
    settings.annotations.some(
      (a) => `annotation.${a.id}` === id && a.kind === "text",
    )
  );
}
export function parentId(id: string): string | null {
  const ep = id.split(".").at(-1) as Endpoint;
  if (id.startsWith("label.") && ENDPOINTS.includes(ep)) return `legend.${ep}`;
  return ENDPOINTS.includes(ep) && !id.startsWith("panel.")
    ? `panel.${ep}`
    : null;
}
export function locked(settings: FigureSettings, id: string): boolean {
  return !!(
    objectStyle(settings, id).locked ||
    (id.startsWith("label.") &&
      !isSharedGroupLabel(id) &&
      settings.elements[id.split(".").slice(0, 2).join(".")]?.locked) ||
    (parentId(id) && locked(settings, parentId(id)!))
  );
}
export function roots(ids: string[], settings: FigureSettings): string[] {
  return [...new Set(ids)].filter(
    (id) =>
      !locked(settings, id) &&
      !id.startsWith("curve.") &&
      !isSharedGroupLabel(id) &&
      !hasSelectedAncestor(id, ids),
  );
}
function hasSelectedAncestor(id: string, ids: string[]): boolean {
  const parent = parentId(id);
  return !!parent && (ids.includes(parent) || hasSelectedAncestor(parent, ids));
}
export function clampMovement(
  settings: FigureSettings,
  ids: string[],
  dx: number,
  dy: number,
) {
  for (const id of ids.filter((id) => id.startsWith("panel."))) {
    const b = panelBox(settings, id);
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
  const next = structuredClone(settings);
  const w = settings.widthIn * 72;
  const h = settings.heightIn * 72;
  const selected = roots(ids, settings);
  ({ dx, dy } = clampMovement(settings, selected, dx, dy));
  for (const id of selected) {
    if (id.startsWith("panel.")) {
      const box = panelBox(next, id);
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
  return editableIds(
    settings.endpoints,
    settings.annotations.map((a) => a.id),
    analysis.grouping.kind !== "median",
  );
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
  const a = new DOMPoint(rect.left, rect.top).matrixTransform(inv);
  const b = new DOMPoint(rect.right, rect.bottom).matrixTransform(inv);
  return { x: a.x, y: a.y, width: b.x - a.x, height: b.y - a.y };
}
export function unionBounds(boxes: Bounds[]): Bounds | null {
  if (!boxes.length) return null;
  const x = Math.min(...boxes.map((b) => b.x));
  const y = Math.min(...boxes.map((b) => b.y));
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
  const next = structuredClone(settings);
  const value = runs.map((r) => r.text).join("");
  const style = (next.elements[id] ??= {});
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
    const horizontal = action === "distribute-x";
    const axis = horizontal ? "x" : "y";
    const dim = horizontal ? "width" : "height";
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
export interface AnnotationClipboard {
  annotations: Annotation[];
  styles: Record<string, ElementStyle>;
}
function selectedAnnotations(settings: FigureSettings, ids: string[]) {
  return settings.annotations.filter(
    (a) =>
      ids.includes(`annotation.${a.id}`) &&
      !locked(settings, `annotation.${a.id}`),
  );
}
export function copyAnnotations(
  settings: FigureSettings,
  ids: string[],
): AnnotationClipboard {
  const annotations = selectedAnnotations(settings, ids);
  return {
    annotations: structuredClone(annotations),
    styles: Object.fromEntries(
      annotations.map((a) => [
        a.id,
        structuredClone(settings.elements[`annotation.${a.id}`] ?? {}),
      ]),
    ),
  };
}
export function pasteAnnotations(
  settings: FigureSettings,
  clipboard: AnnotationClipboard,
): { settings: FigureSettings; ids: string[] } {
  const next = structuredClone(settings);
  const dx = 10 / (settings.widthIn * 72);
  const dy = 10 / (settings.heightIn * 72);
  const ids: string[] = [];
  for (const a of clipboard.annotations.slice(
    0,
    100 - next.annotations.length,
  )) {
    const id = crypto.randomUUID();
    next.annotations.push({
      ...a,
      id,
      x: a.x + dx,
      y: a.y + dy,
      x2: a.x2 + dx,
      y2: a.y2 + dy,
    });
    next.elements[`annotation.${id}`] = structuredClone(clipboard.styles[a.id]);
    ids.push(`annotation.${id}`);
  }
  return { settings: next, ids };
}
export function removeAnnotations(
  settings: FigureSettings,
  ids: string[],
): FigureSettings {
  const removed = selectedAnnotations(settings, ids);
  const next = structuredClone(settings);
  next.annotations = next.annotations.filter(
    (a) => !removed.some((r) => r.id === a.id),
  );
  for (const a of removed) delete next.elements[`annotation.${a.id}`];
  return next;
}
export function reorderAnnotations(
  settings: FigureSettings,
  ids: string[],
  front: boolean,
): FigureSettings {
  const selected = selectedAnnotations(settings, ids);
  const rest = settings.annotations.filter((a) => !selected.includes(a));
  return {
    ...settings,
    annotations: front ? [...rest, ...selected] : [...selected, ...rest],
  };
}
