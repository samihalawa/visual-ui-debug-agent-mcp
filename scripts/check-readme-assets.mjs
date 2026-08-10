import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readme = await readFile(path.join(root, "README.md"), "utf8");
const glama = await readFile(path.join(root, "glama.json"), "utf8");

const references = [
  ...readme.matchAll(/(?:src|href)="([^"]+)"/g),
  ...readme.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g),
].map((match) => match[1]);

const localReferences = references
  .filter((reference) => !/^(?:https?:|mailto:|#)/.test(reference))
  .map((reference) => reference.split("#", 1)[0]);

const failures = [];

for (const reference of new Set(localReferences)) {
  try {
    await access(path.join(root, reference));
  } catch {
    failures.push(`README target does not exist: ${reference}`);
  }
}

const assetDirectory = path.join(root, "publicresources");
const assets = await readdir(assetDirectory);
const publicReferences = `${readme}\n${glama}`;

for (const asset of assets) {
  const relativePath = `publicresources/${asset}`;
  if (!publicReferences.includes(relativePath)) {
    failures.push(`Public asset is not referenced: ${relativePath}`);
  }

  if (asset.endsWith(".svg")) {
    const svg = await readFile(path.join(assetDirectory, asset), "utf8");
    if (!/<svg\b[^>]*>[\s\S]*<\/svg>\s*$/.test(svg)) {
      failures.push(`SVG root is malformed: ${relativePath}`);
    }
    if (/&(?!amp;|lt;|gt;|quot;|apos;|#\d+;|#x[\da-f]+;)/i.test(svg)) {
      failures.push(`SVG contains an unescaped ampersand: ${relativePath}`);
    }
  }
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log(`Verified ${new Set(localReferences).size} local README targets and ${assets.length} public assets.`);
