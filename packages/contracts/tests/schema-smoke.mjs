import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const schemaRoot = path.resolve(here, "../schemas");
const files = [];

function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(file);
    else if (entry.name.endsWith(".json")) files.push(file);
  }
}

walk(schemaRoot);

const documents = files.map((file) => ({
  file,
  document: JSON.parse(fs.readFileSync(file, "utf8")),
}));

const ids = new Map(documents.map(({ file, document }) => [document.$id, file]));
const refs = new Set();

function collectRefs(value) {
  if (!value || typeof value !== "object") return;
  if (typeof value.$ref === "string" && value.$ref.startsWith("https://tavern-forge.dev/")) {
    refs.add(value.$ref);
  }
  for (const child of Object.values(value)) collectRefs(child);
}

for (const { document } of documents) collectRefs(document);

const missing = [...refs].filter((ref) => !ids.has(ref));
if (missing.length > 0) {
  console.error("Missing schema references:");
  for (const ref of missing) console.error(`- ${ref}`);
  process.exit(1);
}

const requiredTitles = ["Story", "Branch", "Scene", "ActorInstance", "Turn", "TurnAttempt", "Beat", "CoreState", "StateMutation"];
const titles = new Set(documents.map(({ document }) => document.title));
const missingTitles = requiredTitles.filter((title) => !titles.has(title));
if (missingTitles.length > 0) {
  console.error(`Missing required schema titles: ${missingTitles.join(", ")}`);
  process.exit(1);
}

console.log(`Schema smoke test passed: ${documents.length} schemas, ${refs.size} external references.`);
