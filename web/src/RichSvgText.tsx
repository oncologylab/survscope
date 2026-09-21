import type { ElementStyle, TextRun } from "./figure";

export function splitLines(runs: TextRun[]): TextRun[][] {
  const lines: TextRun[][] = [[]];
  for (const run of runs)
    run.text.split("\n").forEach((text, i) => {
      if (i) lines.push([]);
      if (text) lines.at(-1)!.push({ ...run, text });
    });
  return lines;
}
export function RichSvgText({
  id,
  value,
  x,
  y,
  size,
  style = {},
  anchor = "middle",
  rotation = 0,
}: {
  id: string;
  value: string;
  x: number;
  y: number;
  size: number;
  style?: ElementStyle;
  anchor?: "start" | "middle" | "end";
  rotation?: number;
}) {
  if (style.hidden) return null;
  const fontSize = style.fontSize ?? size;
  const runs = style.runs ?? [{ text: style.text ?? value }];
  return (
    <text
      data-text-id={id}
      data-text-value={value}
      x={x}
      y={y}
      textAnchor={style.align ?? anchor}
      fontSize={fontSize}
      fill={style.color ?? "#111111"}
      fontFamily={
        style.fontFamily ? `SurvScope ${style.fontFamily}` : undefined
      }
      fontWeight={style.bold === false ? 400 : 700}
      fontStyle={style.italic ? "italic" : "normal"}
      transform={`rotate(${rotation + (style.rotation ?? 0)} ${x} ${y})`}
    >
      {splitLines(runs).map((line, i) => {
        let previous = 0;
        return (
          <tspan key={i} x={x} y={y + i * fontSize * 1.2}>
            {(line.length ? line : [{ text: " " }]).map((run, j) => {
              const offset =
                run.script === "super"
                  ? -fontSize * 0.4
                  : run.script === "sub"
                    ? fontSize * 0.2
                    : 0;
              const dy = offset - previous;
              previous = offset;
              return (
                <tspan
                  key={j}
                  dy={dy}
                  fontSize={run.script ? fontSize * 0.7 : fontSize}
                  fontWeight={(run.bold ?? style.bold ?? true) ? 700 : 400}
                  fontStyle={(run.italic ?? style.italic) ? "italic" : "normal"}
                >
                  {run.text}
                </tspan>
              );
            })}
          </tspan>
        );
      })}
    </text>
  );
}
