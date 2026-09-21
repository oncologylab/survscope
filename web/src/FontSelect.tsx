import { FONT_CATALOG, FONT_FAMILIES } from "./fontCatalog";
import type { FontFamily } from "./fontCatalog";

export function FontSelect({
  label,
  value,
  onChange,
}: {
  label: string;
  value: FontFamily;
  onChange: (family: FontFamily) => void;
}) {
  const font = FONT_CATALOG[value];
  return (
    <label className="font-select">
      <span>{label}</span>
      <select
        aria-label={label}
        value={value}
        title={`${font.name}. ${font.note}`}
        onChange={(event) => onChange(event.target.value as FontFamily)}
      >
        {FONT_FAMILIES.map((family) => (
          <option key={family} value={family}>
            {FONT_CATALOG[family].label}
          </option>
        ))}
      </select>
      <span
        className="font-preview"
        style={{ fontFamily: `SurvScope ${value}` }}
        aria-hidden="true"
      >
        Aa Bb 0123 α β
      </span>
      <small className="font-note">
        {font.name} · {font.note}
      </small>
    </label>
  );
}
