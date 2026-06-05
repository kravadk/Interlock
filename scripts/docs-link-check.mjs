import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, normalize, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const ignoredDirs = new Set([".git", ".next", "node_modules", "dist", "artifacts"]);
const markdownFiles = [];
const failures = [];

collectMarkdownFiles(root);

for (const file of markdownFiles) {
  checkFile(file);
}

if (failures.length > 0) {
  console.error("Docs link check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exitCode = 1;
} else {
  console.log(`Docs link check passed (${markdownFiles.length} markdown files)`);
}

function collectMarkdownFiles(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!ignoredDirs.has(entry.name)) {
        collectMarkdownFiles(join(dir, entry.name));
      }
      continue;
    }

    if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
      markdownFiles.push(join(dir, entry.name));
    }
  }
}

function checkFile(file) {
  const content = readFileSync(file, "utf8");
  checkSuspiciousEncoding(file, content);

  const withoutCodeBlocks = content.replace(/```[\s\S]*?```/g, "");
  const linkPattern = /(?<!!)\[[^\]]+\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;

  for (const match of withoutCodeBlocks.matchAll(linkPattern)) {
    const rawTarget = match[1].trim();
    if (shouldIgnoreTarget(rawTarget)) continue;

    const [targetPath] = rawTarget.split("#");
    if (!targetPath) continue;

    const decodedTarget = decodeTarget(targetPath);
    const resolvedTarget = resolve(dirname(file), normalize(decodedTarget));

    if (!isInsideRoot(resolvedTarget)) {
      failures.push(`${relativeToRoot(file)} links outside repo: ${rawTarget}`);
      continue;
    }

    if (!existsSync(resolvedTarget)) {
      failures.push(`${relativeToRoot(file)} has missing link target: ${rawTarget}`);
      continue;
    }

    if (!statSync(resolvedTarget).isFile() && !statSync(resolvedTarget).isDirectory()) {
      failures.push(`${relativeToRoot(file)} links to unsupported target: ${rawTarget}`);
    }
  }
}

function checkSuspiciousEncoding(file, content) {
  const suspiciousPatterns = [
    "Р¦",
    "Рџ",
    "Рђ",
    "Р†",
    "РЅ",
    "Р°",
    "Рµ",
    "Рѕ",
    "Рё",
    "СЃ",
    "С–",
    "С—",
    "С€",
    "СЋ",
    "СЊ",
  ];

  const matches = suspiciousPatterns.filter((pattern) => content.includes(pattern));
  if (matches.length > 0) {
    failures.push(`${relativeToRoot(file)} contains suspicious mojibake sequences: ${matches.join(", ")}`);
  }
}

function shouldIgnoreTarget(target) {
  return (
    target.startsWith("#") ||
    target.startsWith("http://") ||
    target.startsWith("https://") ||
    target.startsWith("mailto:") ||
    target.startsWith("tel:") ||
    target.startsWith("plugin://") ||
    target.startsWith("app://")
  );
}

function decodeTarget(target) {
  try {
    return decodeURIComponent(target);
  } catch {
    return target;
  }
}

function isInsideRoot(target) {
  const relativeTarget = relative(root, target);
  return relativeTarget === "" || (!relativeTarget.startsWith("..") && !resolve(relativeTarget).startsWith(".."));
}

function relativeToRoot(file) {
  return file.slice(root.length + 1).replaceAll("\\", "/");
}
