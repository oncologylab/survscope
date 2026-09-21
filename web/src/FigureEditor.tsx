import { useEffect, useState } from "react";
import { locked } from "./editorModel";
import { IconButton } from "./IconButton";
import { FontSelect } from "./FontSelect";
import { ENDPOINTS } from "./types";
import type { Endpoint, SurvivalAnalysis } from "./types";
import {
  defaultFigure,
  displayTime,
  elementName,
  layoutFigure,
  timeInMonths,
} from "./figure";
import type { Axes, FigureSettings } from "./figure";

export function NumberField({
  label,
  value,
  onChange,
  min = -10000,
  max = 10000,
  step = 1,
  auto = false,
}: {
  label: string;
  value: number | null;
  onChange: (n: number | null) => void;
  min?: number;
  max?: number;
  step?: number;
  auto?: boolean;
}) {
  const [draft, setDraft] = useState(
    value === null ? "" : String(Number(value.toFixed(6))),
  );
  const [error, setError] = useState("");
  useEffect(() => {
    setDraft(value === null ? "" : String(Number(value.toFixed(6))));
    setError("");
  }, [value]);
  function commit() {
    if (auto && draft.trim() === "") {
      onChange(null);
      setError("");
      return;
    }
    const n = Number(draft);
    if (!draft.trim() || !Number.isFinite(n) || n < min || n > max) {
      setError(
        `Enter a value from ${Number(min.toFixed(4))} to ${Number(max.toFixed(4))}.`,
      );
      return;
    }
    setError("");
    onChange(n);
  }
  return (
    <label className="number-field">
      <span>{label}</span>
      <input
        aria-label={label}
        type="number"
        value={draft}
        min={min}
        max={max}
        step={step}
        placeholder={auto ? "Auto" : undefined}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
            e.currentTarget.blur();
          }
        }}
        aria-invalid={!!error}
      />
      {error && <small className="field-error">{error}</small>}
    </label>
  );
}
function Check({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="check">
      <input
        aria-label={label}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>{label}</span>
    </label>
  );
}
function Color({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="color-field">
      <span>{label}</span>
      <input
        aria-label={label}
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

export function FigureEditor({
  settings,
  analysis,
  selected,
  select,
  change,
  savePreset,
  openFile,
}: {
  settings: FigureSettings;
  analysis: SurvivalAnalysis;
  selected: string | null;
  select: (id: string | null) => void;
  change: (settings: FigureSettings) => void;
  savePreset: () => void;
  openFile: () => void;
}) {
  const [axisScope, setAxisScope] = useState<Endpoint | "all">("all");
  const edit = (fn: (next: FigureSettings) => void) => {
    const next = structuredClone(settings);
    fn(next);
    change(next);
  };
  const field = <K extends keyof FigureSettings>(
    key: K,
    value: FigureSettings[K],
  ) =>
    edit((next) => {
      next[key] = value;
      if (key === "lowLabel" || key === "highLabel") {
        const style =
          next.elements[key === "lowLabel" ? "label.low" : "label.high"];
        if (style) {
          delete style.runs;
          delete style.text;
        }
      }
    });
  const width = settings.widthIn * 72,
    height = settings.heightIn * 72;
  const style = selected ? (settings.elements[selected] ?? {}) : {};
  const item = settings.annotations.find(
    (a) => `annotation.${a.id}` === selected,
  );
  const panel = selected?.startsWith("panel.")
    ? (selected.split(".")[1] as Endpoint)
    : null;
  const isCurve = selected?.startsWith("curve.");
  const editableText =
    selected &&
    /^(title|source|grouping|xlabel|ylabel|label)(\.|$)/.test(selected);
  function textDefault(id: string) {
    const [kind, ep] = id.split(".");
    if (kind === "label")
      return ep === "low" ? settings.lowLabel : settings.highLabel;
    if (kind === "source")
      return `Expression: ${analysis.sourceExpression}; endpoints: ${analysis.sourceSurvival}`;
    if (kind === "grouping") return analysis.groupingLabel;
    if (kind === "xlabel")
      return settings.unit[0].toUpperCase() + settings.unit.slice(1);
    if (kind === "ylabel") return "Survival";
    return ep
      ? `${analysis.gene} ${ep}`
      : `${analysis.gene} ${analysis.cohort.startsWith("CPTAC") ? "" : "TCGA-"}${analysis.cohort} survival`;
  }
  const axes =
    settings.axes[axisScope === "all" ? settings.endpoints[0] : axisScope];
  function axisField<K extends keyof Axes>(key: K, value: Axes[K]) {
    edit((next) => {
      for (const ep of axisScope === "all" ? ENDPOINTS : [axisScope])
        next.axes[ep] = { ...axes, [key]: value };
    });
  }
  const styleField = (key: keyof typeof style, value: any) =>
    edit((next) => {
      const target = (next.elements[selected!] ??= {});
      (target as Record<string, unknown>)[key] = value;
      if (key === "text" && selected?.startsWith("label.")) {
        next[selected === "label.low" ? "lowLabel" : "highLabel"] = value;
        delete target.text;
      }
      if (key === "text" || key === "bold" || key === "italic")
        delete target.runs;
    });
  const elements = [
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

  return (
    <aside className="editor-controls" aria-label="Figure properties">
      <div className="selected-item-field">
        <div className="field-label-with-help">
          <label htmlFor="selected-figure-item">Selected item</label>
          <IconButton
            icon="info"
            label="Editing help"
            description="Double-click text to type directly on the figure. Select an item to adjust its appearance here."
          />
        </div>
        <select
          id="selected-figure-item"
          aria-label="Selected item"
          value={selected ?? ""}
          onChange={(e) => select(e.target.value || null)}
        >
          <option value="">Whole figure</option>
          {elements.map((id) => (
            <option key={id} value={id}>
              {elementName(id)}
            </option>
          ))}
        </select>
      </div>
      {selected && (
        <details open key={selected} className="selected-properties">
          <summary>{elementName(selected)}</summary>
          <fieldset
            className="object-properties"
            disabled={locked(settings, selected)}
          >
            {editableText && (
              <label>
                <span>Text</span>
                <textarea
                  aria-label="Text"
                  maxLength={500}
                  value={style.text ?? textDefault(selected)}
                  onChange={(e) => styleField("text", e.target.value)}
                />
              </label>
            )}
            {(editableText || item?.kind === "text") && (
              <div className="property-grid">
                <FontSelect
                  label="Selected font"
                  value={style.fontFamily ?? settings.fontFamily}
                  onChange={(value) => styleField("fontFamily", value)}
                />
                <label>
                  <span>Text alignment</span>
                  <select
                    aria-label="Text alignment"
                    value={style.align ?? (item ? "start" : "middle")}
                    onChange={(e) => styleField("align", e.target.value)}
                  >
                    <option value="start">Left</option>
                    <option value="middle">Center</option>
                    <option value="end">Right</option>
                  </select>
                </label>
                <NumberField
                  label="Text rotation (degrees)"
                  value={style.rotation ?? 0}
                  min={-360}
                  max={360}
                  onChange={(value) => styleField("rotation", value)}
                />
              </div>
            )}
            {panel && (
              <div className="property-grid">
                {(["x", "y", "width", "height"] as const).map((key) => {
                  const scale = key === "x" || key === "width" ? width : height;
                  const box = settings.panels[panel];
                  return (
                    <NumberField
                      key={key}
                      label={`Panel ${key} (pt)`}
                      value={box[key] * scale}
                      min={key === "width" || key === "height" ? 30 : 0}
                      max={
                        scale *
                        (key === "x"
                          ? 1 - box.width
                          : key === "y"
                            ? 1 - box.height
                            : key === "width"
                              ? 1 - box.x
                              : 1 - box.y)
                      }
                      onChange={(value) =>
                        edit((next) => {
                          next.panels[panel][key] = value! / scale;
                        })
                      }
                    />
                  );
                })}
              </div>
            )}
            {item && (
              <>
                {item.kind === "text" && (
                  <label>
                    <span>Annotation text</span>
                    <textarea
                      aria-label="Annotation text"
                      maxLength={500}
                      value={item.text}
                      onChange={(e) =>
                        edit((next) => {
                          next.annotations.find((a) => a.id === item.id)!.text =
                            e.target.value;
                          if (next.elements[selected!])
                            delete next.elements[selected!].runs;
                        })
                      }
                    />
                  </label>
                )}
                <div className="property-grid">
                  {(
                    [
                      "x",
                      "y",
                      ...(item.kind === "text" ? [] : ["x2", "y2"]),
                    ] as ("x" | "y" | "x2" | "y2")[]
                  ).map((key) => (
                    <NumberField
                      key={key}
                      label={`${key.toUpperCase()} (pt)`}
                      value={item[key] * (key.startsWith("x") ? width : height)}
                      min={-10 * (key.startsWith("x") ? width : height)}
                      max={10 * (key.startsWith("x") ? width : height)}
                      onChange={(value) =>
                        edit((next) => {
                          next.annotations.find((a) => a.id === item.id)![key] =
                            value! / (key.startsWith("x") ? width : height);
                        })
                      }
                    />
                  ))}
                  <NumberField
                    label={
                      item.kind === "text"
                        ? "Annotation font size (pt)"
                        : "Annotation line width (pt)"
                    }
                    value={
                      item.kind === "text"
                        ? (style.fontSize ?? item.fontSize)
                        : item.lineWidth
                    }
                    min={item.kind === "text" ? 4 : 0.2}
                    max={item.kind === "text" ? 72 : 12}
                    step={0.5}
                    onChange={(value) =>
                      edit((next) => {
                        next.annotations.find((a) => a.id === item.id)![
                          item.kind === "text" ? "fontSize" : "lineWidth"
                        ] = value!;
                        if (item.kind === "text" && next.elements[selected!])
                          delete next.elements[selected!].fontSize;
                      })
                    }
                  />
                </div>
                <Color
                  label="Annotation color"
                  value={item.color}
                  onChange={(value) =>
                    edit((next) => {
                      next.annotations.find((a) => a.id === item.id)!.color =
                        value;
                    })
                  }
                />
                <IconButton
                  icon="delete"
                  label="Remove annotation"
                  onClick={() => {
                    edit((next) => {
                      next.annotations = next.annotations.filter(
                        (a) => a.id !== item.id,
                      );
                      delete next.elements[`annotation.${item.id}`];
                    });
                    select(null);
                  }}
                />
              </>
            )}
            {!panel && !item && (
              <>
                <div className="property-grid">
                  {!isCurve && (
                    <>
                      {!selected.startsWith("label.") && (
                        <NumberField
                          label="Horizontal offset (pt)"
                          value={style.dx ?? 0}
                          onChange={(value) => styleField("dx", value)}
                        />
                      )}
                      {!selected.startsWith("label.") && (
                        <NumberField
                          label="Vertical offset (pt)"
                          value={style.dy ?? 0}
                          onChange={(value) => styleField("dy", value)}
                        />
                      )}
                      <NumberField
                        label="Text size (pt)"
                        value={style.fontSize ?? null}
                        auto
                        min={4}
                        max={72}
                        step={0.5}
                        onChange={(value) =>
                          styleField("fontSize", value ?? undefined)
                        }
                      />
                    </>
                  )}
                  {isCurve && (
                    <NumberField
                      label="Selected line width (pt)"
                      value={style.lineWidth ?? settings.lineWidth}
                      min={0.2}
                      max={12}
                      step={0.1}
                      onChange={(value) => styleField("lineWidth", value)}
                    />
                  )}
                </div>
                <Color
                  label="Selected item color"
                  value={
                    style.color ??
                    (isCurve
                      ? selected.includes(".low.")
                        ? settings.lowColor
                        : settings.highColor
                      : "#111111")
                  }
                  onChange={(value) => styleField("color", value)}
                />
                {!isCurve && (
                  <div
                    className="button-row"
                    role="group"
                    aria-label="Text style"
                  >
                    <IconButton
                      icon="bold"
                      label="Bold text"
                      aria-pressed={style.bold !== false}
                      onClick={() => styleField("bold", style.bold === false)}
                    />
                    <IconButton
                      icon="italic"
                      label="Italic text"
                      aria-pressed={!!style.italic}
                      onClick={() => styleField("italic", !style.italic)}
                    />
                  </div>
                )}
                <Check
                  label="Show this item"
                  checked={!style.hidden}
                  onChange={(value) => styleField("hidden", !value)}
                />
              </>
            )}
            {!item && (
              <IconButton
                icon="reset"
                label="Reset selected item"
                onClick={() =>
                  edit((next) => {
                    if (panel)
                      next.panels[panel] = defaultFigure().panels[panel];
                    else delete next.elements[selected];
                  })
                }
              />
            )}
            {selected.startsWith("statistics.") && (
              <p className="help-text">
                Statistics update with your analysis. Their values cannot be
                typed over.
              </p>
            )}
          </fieldset>
        </details>
      )}
      <details open>
        <summary>Size and appearance</summary>
        <div className="property-grid">
          <NumberField
            label="Width (inches)"
            value={settings.widthIn}
            min={2}
            max={20}
            step={0.1}
            onChange={(n) => field("widthIn", n!)}
          />
          <NumberField
            label="Height (inches)"
            value={settings.heightIn}
            min={2}
            max={20}
            step={0.1}
            onChange={(n) => field("heightIn", n!)}
          />
          <NumberField
            label="Text scale"
            value={settings.fontScale}
            min={0.5}
            max={3}
            step={0.1}
            onChange={(n) => field("fontScale", n!)}
          />
          <NumberField
            label="Curve width (pt)"
            value={settings.lineWidth}
            min={0.2}
            max={12}
            step={0.1}
            onChange={(n) => field("lineWidth", n!)}
          />
        </div>
        <FontSelect
          label="Font"
          value={settings.fontFamily}
          onChange={(value) => field("fontFamily", value)}
        />
        <div className="property-grid">
          <Color
            label="Lower expression"
            value={settings.lowColor}
            onChange={(v) => field("lowColor", v)}
          />
          <Color
            label="Higher expression"
            value={settings.highColor}
            onChange={(v) => field("highColor", v)}
          />
        </div>
        <div className="property-grid">
          {(["low", "high"] as const).map((group) => (
            <label key={group}>
              <span>{group === "low" ? "Lower" : "Higher"} line</span>
              <select
                aria-label={`${group === "low" ? "Lower" : "Higher"} line`}
                value={settings[`${group}Dash`]}
                onChange={(e) =>
                  field(
                    `${group}Dash`,
                    e.target.value as FigureSettings["lowDash"],
                  )
                }
              >
                <option value="solid">Solid</option>
                <option value="dashed">Dashed</option>
                <option value="dotted">Dotted</option>
              </select>
            </label>
          ))}
        </div>
      </details>
      <details>
        <summary>Outcomes and layout</summary>
        {ENDPOINTS.map((ep) => (
          <Check
            key={ep}
            label={`${ep}${analysis.endpoints[ep].quality === "unavailable" ? " — unavailable" : ""}`}
            checked={settings.endpoints.includes(ep)}
            onChange={(checked) => {
              const next = structuredClone(settings);
              next.endpoints = checked
                ? [...next.endpoints, ep]
                : next.endpoints.filter((x) => x !== ep);
              if (next.endpoints.length) change(layoutFigure(next, "grid"));
            }}
          />
        ))}
        <div className="button-row">
          <IconButton
            icon="grid"
            label="Grid"
            onClick={() => change(layoutFigure(settings, "grid"))}
          />
          <IconButton
            icon="row"
            label="Horizontal"
            onClick={() => change(layoutFigure(settings, "row"))}
          />
          <IconButton
            icon="column"
            label="Vertical"
            onClick={() => change(layoutFigure(settings, "column"))}
          />
        </div>
        {settings.endpoints.map((ep, i) => (
          <div key={ep} className="order-row">
            <span>{ep}</span>
            <IconButton
              icon="up"
              disabled={!i}
              label={`Move ${ep} earlier`}
              onClick={() =>
                edit((next) => {
                  const previous = next.endpoints[i - 1];
                  [next.endpoints[i - 1], next.endpoints[i]] = [ep, previous];
                  [next.panels[ep], next.panels[previous]] = [
                    next.panels[previous],
                    next.panels[ep],
                  ];
                })
              }
            />
          </div>
        ))}
      </details>
      <details>
        <summary>Axes</summary>
        <label>
          <span>Apply axis settings to</span>
          <select
            aria-label="Apply axis settings to"
            value={axisScope}
            onChange={(e) => setAxisScope(e.target.value as Endpoint | "all")}
          >
            <option value="all">All outcomes</option>
            {ENDPOINTS.map((ep) => (
              <option key={ep}>{ep}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Time unit</span>
          <select
            aria-label="Time unit"
            value={settings.unit}
            onChange={(e) =>
              edit((next) => {
                const unit = e.target.value as FigureSettings["unit"];
                for (const ep of ENDPOINTS)
                  for (const key of ["xMin", "xMax", "xStep"] as const) {
                    const value = next.axes[ep][key];
                    if (value !== null)
                      next.axes[ep][key] = displayTime(
                        timeInMonths(value, next.unit),
                        unit,
                      );
                  }
                next.unit = unit;
              })
            }
          >
            <option value="months">Months</option>
            <option value="years">Years</option>
            <option value="days">Days</option>
          </select>
        </label>
        <div className="property-grid">
          <NumberField
            label="Time starts at"
            value={axes.xMin}
            min={0}
            max={axes.xMax === null ? 100000 : axes.xMax - 0.0001}
            onChange={(n) => axisField("xMin", n!)}
          />
          <NumberField
            label="Time ends at"
            value={axes.xMax}
            auto
            min={axes.xMin + 0.0001}
            max={100000}
            onChange={(n) => axisField("xMax", n)}
          />
          <NumberField
            label="Time tick spacing"
            value={axes.xStep}
            auto
            min={0.0001}
            max={100000}
            step={0.1}
            onChange={(n) => axisField("xStep", n)}
          />
          <NumberField
            label="Survival minimum"
            value={axes.yMin}
            min={0}
            max={axes.yMax - 0.001}
            step={0.1}
            onChange={(n) => axisField("yMin", n!)}
          />
          <NumberField
            label="Survival maximum"
            value={axes.yMax}
            min={axes.yMin + 0.001}
            max={1}
            step={0.1}
            onChange={(n) => axisField("yMax", n!)}
          />
          <NumberField
            label="Survival tick spacing"
            value={axes.yStep}
            min={0.01}
            max={1}
            step={0.1}
            onChange={(n) => axisField("yStep", n!)}
          />
        </div>
        <p className="help-text">
          Changing the visible range does not change the analysis or remove
          follow-up data.
        </p>
      </details>
      <details>
        <summary>Survival details</summary>
        <Check
          label="Confidence bands"
          checked={settings.confidence}
          onChange={(v) => field("confidence", v)}
        />
        {settings.confidence && (
          <label>
            <span>Confidence level</span>
            <select
              aria-label="Confidence level"
              value={settings.confidenceLevel}
              onChange={(e) =>
                field(
                  "confidenceLevel",
                  Number(e.target.value) as FigureSettings["confidenceLevel"],
                )
              }
            >
              <option value="0.9">90%</option>
              <option value="0.95">95%</option>
              <option value="0.99">99%</option>
            </select>
          </label>
        )}
        <Check
          label="Censor marks"
          checked={settings.censors}
          onChange={(v) => field("censors", v)}
        />
        <Check
          label="Number-at-risk tables"
          checked={settings.riskTable}
          onChange={(v) => field("riskTable", v)}
        />
        <Check
          label="Show log-rank p-value"
          checked={settings.showP}
          onChange={(v) => field("showP", v)}
        />
        <Check
          label="Show adjusted q-value"
          checked={settings.showQ}
          onChange={(v) => field("showQ", v)}
        />
        <Check
          label="Show hazard ratio"
          checked={settings.showHr}
          onChange={(v) => field("showHr", v)}
        />
      </details>
      <details>
        <summary>Legend and annotations</summary>
        <Check
          label="Show legends"
          checked={settings.showLegend}
          onChange={(v) => field("showLegend", v)}
        />
        <label>
          <span>Lower group label</span>
          <input
            aria-label="Lower group label"
            maxLength={40}
            value={settings.lowLabel}
            onChange={(e) => field("lowLabel", e.target.value)}
          />
        </label>
        <label>
          <span>Higher group label</span>
          <input
            aria-label="Higher group label"
            maxLength={40}
            value={settings.highLabel}
            onChange={(e) => field("highLabel", e.target.value)}
          />
        </label>
        <div className="button-row">
          {(["text", "line", "arrow"] as const).map((kind) => (
            <IconButton
              icon={kind === "text" ? "type" : kind}
              label={`Add ${kind}`}
              key={kind}
              disabled={settings.annotations.length >= 100}
              onClick={() => {
                const id = crypto.randomUUID();
                edit((next) =>
                  next.annotations.push({
                    id,
                    kind,
                    text: "Your note",
                    x: 0.3,
                    y: 0.5,
                    x2: 0.55,
                    y2: 0.6,
                    fontSize: 10,
                    lineWidth: 1,
                    color: "#111111",
                  }),
                );
                select(`annotation.${id}`);
              }}
            />
          ))}
        </div>
      </details>
      <details>
        <summary>Export and reuse</summary>
        <label>
          <span>PNG resolution</span>
          <select
            aria-label="PNG resolution"
            value={settings.dpi}
            onChange={(e) =>
              field("dpi", Number(e.target.value) as FigureSettings["dpi"])
            }
          >
            <option value="150">150 DPI</option>
            <option value="300">300 DPI</option>
            <option value="600">600 DPI</option>
          </select>
        </label>
        <div className="button-row">
          <IconButton
            icon="save"
            label="Save style preset"
            onClick={savePreset}
          />
          <IconButton
            icon="open"
            label="Open preset or project"
            onClick={openFile}
          />
        </div>
        <p className="help-text">
          Presets reuse appearance. Projects also keep your results, labels, and
          notes.
        </p>
      </details>
    </aside>
  );
}
