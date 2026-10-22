import { IconButton } from "./IconButton";
import { objectIds, parentId } from "./editorModel";
import { elementName } from "./figure";
import type { FigureSettings } from "./figure";
import type { SurvivalAnalysis } from "./types";

export function LayersPanel({
  settings,
  analysis,
  selection,
  select,
  change,
}: {
  settings: FigureSettings;
  analysis: SurvivalAnalysis;
  selection: string[];
  select: (ids: string[]) => void;
  change: (settings: FigureSettings) => void;
}) {
  const toggle = (id: string, key: "hidden" | "locked") =>
    change({
      ...settings,
      elements: {
        ...settings.elements,
        [id]: {
          ...settings.elements[id],
          [key]: !settings.elements[id]?.[key],
        },
      },
    });
  return (
    <div className="layers-list" role="tree" aria-label="Figure objects">
      {objectIds(settings, analysis).map((id) => {
        const style = settings.elements[id];
        return (
          <div
            key={id}
            className={`layer-row ${selection.includes(id) ? "selected" : ""}`}
            style={{ paddingLeft: parentId(id) ? 18 : 4 }}
            role="treeitem"
            aria-level={parentId(id) ? 2 : 1}
            aria-selected={selection.includes(id)}
          >
            <button
              className="layer-select"
              onClick={(e) =>
                select(
                  e.shiftKey
                    ? selection.includes(id)
                      ? selection.filter((x) => x !== id)
                      : [...selection, id]
                    : [id],
                )
              }
            >
              {elementName(id)}
            </button>
            <IconButton
              icon={style?.hidden ? "eye-off" : "eye"}
              label={`Hide ${elementName(id)}`}
              description={
                style?.hidden ? "Click to show this object." : undefined
              }
              aria-pressed={!!style?.hidden}
              onClick={() => toggle(id, "hidden")}
            />
            <IconButton
              icon={style?.locked ? "lock" : "unlock"}
              label={`Lock ${elementName(id)}`}
              description={
                style?.locked ? "Click to unlock this object." : undefined
              }
              aria-pressed={!!style?.locked}
              onClick={() => toggle(id, "locked")}
            />
          </div>
        );
      })}
    </div>
  );
}
