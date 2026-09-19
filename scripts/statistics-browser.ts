// Node-only validation entrypoint; never included in the static application.
import { readFileSync } from "node:fs";
import {
  analyzeGeneData,
  confidenceBounds,
  prepareEndpoint,
} from "../web/src/statistics";
import { normalizeGrouping } from "../web/src/grouping";
import { ENDPOINTS } from "../web/src/types";

const cases = JSON.parse(readFileSync(process.argv[2], "utf8"));
const output = cases.map((item: any) => {
  const data = {
    ...item.data,
    expression: Uint16Array.from(item.data.expression),
  };
  const spec = normalizeGrouping(item.grouping);
  const result = analyzeGeneData(data, spec);
  const groups = Object.fromEntries(
    ENDPOINTS.map((endpoint) => {
      const prepared = prepareEndpoint(data, endpoint, spec);
      return [
        endpoint,
        {
          low: prepared.indices.filter((_, i) => !prepared.high[i]),
          high: prepared.indices.filter((_, i) => prepared.high[i]),
        },
      ];
    }),
  );
  const intervals = Object.fromEntries(
    ENDPOINTS.map((endpoint) => [
      endpoint,
      Object.fromEntries(
        (["low", "high"] as const).map((group) => [
          group,
          [0.9, 0.95, 0.99].map((level) =>
            result.endpoints[endpoint][group].timeline.map((point) =>
              confidenceBounds(point.survival, point.greenwood, level),
            ),
          ),
        ]),
      ),
    ]),
  );
  return { id: item.id, endpoints: result.endpoints, groups, intervals };
});
process.stdout.write(JSON.stringify(output));
