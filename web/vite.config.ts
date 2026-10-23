import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "/survscope/",
  build: {
    target: "es2022",
    sourcemap: true,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: "react",
              test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/,
            },
            {
              name: "prosemirror",
              test: /node_modules[\\/](prosemirror-|orderedmap|rope-sequence|w3c-keyname)/,
            },
          ],
        },
      },
    },
  },
});
