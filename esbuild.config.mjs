import esbuild from "esbuild";

const watch = process.argv.includes("--watch");

const ctx = await esbuild.context({
  entryPoints: ["src/main.ts"],
  bundle: true,
  format: "cjs",
  target: "es2020",
  platform: "browser",
  external: ["obsidian", "electron", "@codemirror/state", "@codemirror/view", "@codemirror/language"],
  outfile: "main.js",
  sourcemap: watch ? "inline" : false,
  logLevel: "info",
});

if (watch) await ctx.watch();
else { await ctx.rebuild(); await ctx.dispose(); }
