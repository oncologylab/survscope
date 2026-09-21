import type { FontFamily } from "./figure";
import { FONT_CATALOG } from "./fontCatalog";

const styles = [
  { style: "normal", weight: 400, pdf: "normal" },
  { style: "normal", weight: 700, pdf: "bold" },
  { style: "italic", weight: 400, pdf: "italic" },
  { style: "italic", weight: 700, pdf: "bolditalic" },
];
const cache = new Map<string, Promise<string>>();
function base64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 32768)
    binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return btoa(binary);
}
export async function embeddedFonts(family: FontFamily) {
  return Promise.all(
    styles.map(async (style, index) => {
      const name = FONT_CATALOG[family].files[index];
      if (!cache.has(name)) {
        const url = `${import.meta.env.BASE_URL}fonts/${name}`;
        const promise = fetch(url, { credentials: "same-origin" })
          .then((response) => {
            if (!response.ok)
              throw new Error(
                "Unable to load the figure font. Check your connection and retry.",
              );
            return response.arrayBuffer();
          })
          .then((buffer) => base64(new Uint8Array(buffer)))
          .catch((error) => {
            cache.delete(name);
            throw error;
          });
        cache.set(name, promise);
      }
      return {
        ...style,
        name,
        family: `SurvScope ${family}`,
        data: await cache.get(name)!,
      };
    }),
  );
}
