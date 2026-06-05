import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import Link from "next/link";
import type { Metadata } from "next";

type PageProps = {
  params: Promise<{ slug?: string[] }>;
};

const DOCS_ROOT = path.resolve(process.cwd(), "..", "..", "docs");

export const metadata: Metadata = {
  title: "Docs",
  description: "Interlock developer documentation for SDK, REST, CLI, MCP, Recorder, dashboard, and deployment flows.",
};

export default async function DocsPage({ params }: PageProps) {
  const { slug } = await params;
  const docs = await listDocs();
  const selected = slug?.join("/") ?? "README";
  const fileName = selected.endsWith(".md") ? selected : `${selected}.md`;
  const safeFileName = normalizeDocName(fileName);
  const filePath = path.join(DOCS_ROOT, safeFileName);
  const exists = existsSync(filePath);
  const content = exists ? await readFile(filePath, "utf8") : `# Document not found\n\nNo docs file exists at \`${safeFileName}\`.`;

  return (
    <main className="shell">
      <section className="topbar">
        <div>
          <p className="eyebrow">Interlock docs</p>
          <h1>Developer Documentation</h1>
          <p className="subtitle">
            Markdown docs served from the repository. Use these routes for hosted onboarding without fake examples or generated content.
          </p>
          <div className="sectionNav">
            <Link href="/app">Open Control Plane</Link>
            <Link href="/changelog">Changelog</Link>
          </div>
        </div>
        <div className="statusStrip">
          <span>{docs.length} docs</span>
          <span>{exists ? safeFileName : "missing"}</span>
        </div>
      </section>

      <section className="grid">
        <aside className="panel">
          <header>
            <div>
              <h2>Docs Index</h2>
              <p>Repository-backed pages.</p>
            </div>
          </header>
          <div className="history">
            {docs.map((doc) => {
              const slugName = doc.replace(/\.md$/, "");
              return (
                <Link className="historyItem" href={`/docs/${slugName}`} key={doc}>
                  <strong>{doc}</strong>
                  <span>Open</span>
                </Link>
              );
            })}
          </div>
        </aside>
        <article className="panel wide">
          <header>
            <div>
              <h2>{safeFileName}</h2>
              <p>Rendered as trusted repository text.</p>
            </div>
          </header>
          <pre className="docPre">{content}</pre>
        </article>
      </section>
    </main>
  );
}

async function listDocs() {
  // Deploy-safe: if the docs/ directory is excluded from the bundle, render an empty index
  // instead of throwing a runtime 500.
  try {
    const entries = await readdir(DOCS_ROOT);
    return entries.filter((entry) => entry.endsWith(".md")).sort((a, b) => a.localeCompare(b));
  } catch {
    return [];
  }
}

function normalizeDocName(value: string) {
  const normalized = path.normalize(value).replaceAll("\\", "/");
  if (normalized.startsWith("../") || normalized.includes("/../") || path.isAbsolute(normalized)) {
    return "README.md";
  }
  return normalized;
}
