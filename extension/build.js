import { build } from "esbuild";
import { copyFileSync } from "fs";

await build({
  entryPoints: ["terminal-src.js"],
  bundle: true,
  outfile: "terminal.js",
  format: "iife",
  target: "chrome120",
  minify: false,
  sourcemap: true,
});

// Copy xterm CSS to extension root
copyFileSync("node_modules/@xterm/xterm/css/xterm.css", "xterm.css");

console.log("Built terminal.js + xterm.css");
