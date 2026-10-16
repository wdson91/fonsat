import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
async function files(directory) {
  const rows = await readdir(directory, { withFileTypes: true });
  return (
    await Promise.all(
      rows.map(async (row) =>
        row.isDirectory()
          ? files(path.join(directory, row.name))
          : path.join(directory, row.name),
      ),
    )
  ).flat();
}
const buildId = (await readFile(".next/BUILD_ID", "utf8")).trim();
const assets = (await files(".next/static"))
  .filter((file) => !file.endsWith(".map"))
  .map(
    (file) =>
      "/" + file.replaceAll(path.sep, "/").replace(/^\.next\//, "_next/"),
  );
const template = await readFile("src/offline/service-worker.js", "utf8");
await mkdir("public", { recursive: true });
await writeFile(
  "public/sw.js",
  template
    .replace("__BUILD_ID__", buildId)
    .replace(
      "__PRECACHE_ASSETS__",
      JSON.stringify(["/", "/icon.svg", "/manifest.webmanifest", ...assets]),
    ),
);
