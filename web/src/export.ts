import { jsPDF } from "jspdf";
import { svg2pdf } from "svg2pdf.js";

import type { SurvivalAnalysis } from "./types";

const POINTS = 489.6;

function filename(analysis: SurvivalAnalysis, extension: string): string {
  return `${analysis.gene}_TCGA_${analysis.cohort}_KM_survival.${extension}`;
}

function download(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function serializedSvg(svg: SVGSVGElement): string {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", "6.8in");
  clone.setAttribute("height", "6.8in");
  return new XMLSerializer().serializeToString(clone);
}

export function saveSvg(
  svg: SVGSVGElement,
  analysis: SurvivalAnalysis,
): void {
  download(
    new Blob([serializedSvg(svg)], { type: "image/svg+xml;charset=utf-8" }),
    filename(analysis, "svg"),
  );
}

export async function savePng(
  svg: SVGSVGElement,
  analysis: SurvivalAnalysis,
  dpi: 150 | 300 | 600,
): Promise<void> {
  const pixels = Math.round(6.8 * dpi);
  const source = new Blob([serializedSvg(svg)], { type: "image/svg+xml" });
  const url = URL.createObjectURL(source);
  try {
    const image = new Image();
    image.decoding = "sync";
    const loaded = new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Unable to rasterize SVG"));
    });
    image.src = url;
    await loaded;
    const canvas = document.createElement("canvas");
    canvas.width = pixels;
    canvas.height = pixels;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas is unavailable");
    context.fillStyle = "#fff";
    context.fillRect(0, 0, pixels, pixels);
    context.drawImage(image, 0, 0, pixels, pixels);
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (value) => (value ? resolve(value) : reject(new Error("PNG export failed"))),
        "image/png",
      ),
    );
    download(blob, filename(analysis, "png"));
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function savePdf(
  svg: SVGSVGElement,
  analysis: SurvivalAnalysis,
): Promise<void> {
  const document = new jsPDF({
    orientation: "portrait",
    unit: "pt",
    format: [POINTS, POINTS],
    compress: true,
    putOnlyUsedFonts: true,
  });
  await svg2pdf(svg, document, {
    x: 0,
    y: 0,
    width: POINTS,
    height: POINTS,
  });
  document.save(filename(analysis, "pdf"));
}

export function saveJson(analysis: SurvivalAnalysis): void {
  download(
    new Blob([`${JSON.stringify(analysis, null, 2)}\n`], {
      type: "application/json",
    }),
    filename(analysis, "json"),
  );
}
