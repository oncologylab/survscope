import { figureFilename } from "./cohorts";
import { defaultFigure } from "./figure";
import { attachProvenance } from "./citations";
import { embeddedFonts } from "./fonts";
import type { FigureSettings } from "./figure";
import type { SurvivalAnalysis } from "./types";

export function download(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob),
    anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  // Allow the browser's download handler to consume the blob before revoking it.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function exportSvg(
  svg: SVGSVGElement,
  settings: FigureSettings,
): Promise<SVGSVGElement> {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", `${settings.widthIn}in`);
  clone.setAttribute("height", `${settings.heightIn}in`);
  clone
    .querySelectorAll("[data-editor-only]")
    .forEach((element) => element.remove());
  clone.querySelectorAll("[data-element]").forEach((element) => {
    element.removeAttribute("data-element");
    element.removeAttribute("pointer-events");
    (element as SVGElement).style.removeProperty("cursor");
  });
  clone.style.removeProperty("touch-action");
  const fonts = await figureFonts(settings);
  const style = document.createElementNS("http://www.w3.org/2000/svg", "style");
  style.textContent = fonts
    .map(
      (font) =>
        `@font-face{font-family:"${font.family}";font-style:${font.style};font-weight:${font.weight};src:url("data:font/ttf;base64,${font.data}") format("truetype");}`,
    )
    .join("\n");
  clone.prepend(style);
  return clone;
}
export async function saveSvg(
  svg: SVGSVGElement,
  analysis: SurvivalAnalysis,
  settings = defaultFigure(),
): Promise<void> {
  const clone = await exportSvg(svg, settings);
  download(
    new Blob([new XMLSerializer().serializeToString(clone)], {
      type: "image/svg+xml;charset=utf-8",
    }),
    figureFilename(analysis.gene, analysis.cohort, "svg"),
  );
}
// Canvas PNGs otherwise advertise 96 DPI regardless of their pixel dimensions.
// Write the standard pHYs chunk so print software reads the requested resolution.
export async function pngResolution(blob: Blob, dpi: number): Promise<Blob> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const chunk = new Uint8Array(21),
    view = new DataView(chunk.buffer);
  view.setUint32(0, 9);
  chunk.set([112, 72, 89, 115], 4); // pHYs
  const pixelsPerMetre = Math.round(dpi / 0.0254);
  view.setUint32(8, pixelsPerMetre);
  view.setUint32(12, pixelsPerMetre);
  chunk[16] = 1;
  let crc = 0xffffffff;
  for (const byte of chunk.subarray(4, 17)) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++)
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  view.setUint32(17, (crc ^ 0xffffffff) >>> 0);
  const parts: Uint8Array<ArrayBuffer>[] = [bytes.slice(0, 33), chunk];
  const input = new DataView(bytes.buffer);
  for (let at = 33; at < bytes.length;) {
    const size = input.getUint32(at) + 12;
    if (String.fromCharCode(...bytes.subarray(at + 4, at + 8)) !== "pHYs")
      parts.push(bytes.slice(at, at + size));
    at += size;
  }
  return new Blob(parts, { type: "image/png" });
}

export async function savePng(
  svg: SVGSVGElement,
  analysis: SurvivalAnalysis,
  dpi: 150 | 300 | 600,
  settings = defaultFigure(),
): Promise<void> {
  const width = Math.round(settings.widthIn * dpi),
    height = Math.round(settings.heightIn * dpi);
  if (width * height > 40_000_000)
    throw new Error(
      "This PNG exceeds 40 million pixels. Choose a lower resolution or smaller figure.",
    );
  const clone = await exportSvg(svg, settings);
  const url = URL.createObjectURL(
    new Blob([new XMLSerializer().serializeToString(clone)], {
      type: "image/svg+xml",
    }),
  );
  try {
    const image = new Image();
    const loaded = new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Unable to rasterize SVG"));
    });
    image.src = url;
    await loaded;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas is unavailable");
    context.fillStyle = "#fff";
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (value) =>
          value ? resolve(value) : reject(new Error("PNG export failed")),
        "image/png",
      ),
    );
    download(
      await pngResolution(blob, dpi),
      figureFilename(analysis.gene, analysis.cohort, "png"),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}
export async function savePdf(
  svg: SVGSVGElement,
  analysis: SurvivalAnalysis,
  settings = defaultFigure(),
): Promise<void> {
  const [{ jsPDF }, { svg2pdf }] = await Promise.all([
    import("jspdf"),
    import("svg2pdf.js"),
  ]);
  const width = settings.widthIn * 72,
    height = settings.heightIn * 72;
  const pdf = new jsPDF({
    orientation: width > height ? "landscape" : "portrait",
    unit: "pt",
    format: [width, height],
    compress: true,
    putOnlyUsedFonts: true,
  });
  for (const font of await figureFonts(settings)) {
    pdf.addFileToVFS(font.name, font.data);
    pdf.addFont(font.name, font.family, font.pdf);
  }
  const clone = await exportSvg(svg, settings);
  // svg2pdf uses the registered TTFs; embedded CSS is for standalone SVG/PNG.
  clone.querySelectorAll("style").forEach((style) => style.remove());
  await svg2pdf(clone, pdf, { x: 0, y: 0, width, height });
  pdf.save(figureFilename(analysis.gene, analysis.cohort, "pdf"));
}
export function saveJson(analysis: SurvivalAnalysis): void {
  download(
    new Blob(
      [
        `${JSON.stringify(analysis.provenance ? analysis : attachProvenance(analysis), null, 2)}\n`,
      ],
      {
        type: "application/json",
      },
    ),
    figureFilename(analysis.gene, analysis.cohort, "json"),
  );
}

async function figureFonts(settings: FigureSettings) {
  const families = new Set([
    settings.fontFamily,
    ...Object.values(settings.elements).flatMap((s) =>
      s.fontFamily ? [s.fontFamily] : [],
    ),
  ]);
  return (await Promise.all([...families].map(embeddedFonts))).flat();
}
