import { readFile } from "node:fs/promises";
import path from "node:path";
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Changelog",
  description: "Interlock release notes and Dev Alpha changes.",
};

export default async function ChangelogPage() {
  const changelogPath = path.resolve(process.cwd(), "..", "..", "CHANGELOG.md");
  // Build-safe: this page is statically prerendered, so a missing CHANGELOG.md (e.g. excluded from
  // the deploy bundle) must not crash `next build`. Fall back to a pointer instead.
  const changelog = await readFile(changelogPath, "utf8").catch(
    () => "# Changelog\n\nRelease notes are maintained in the repository's CHANGELOG.md.",
  );

  return (
    <main className="shell">
      <section className="topbar">
        <div>
          <p className="eyebrow">Interlock releases</p>
          <h1>Changelog</h1>
          <p className="subtitle">Repository-backed release notes for package, dashboard, and deployment changes.</p>
          <div className="sectionNav">
            <Link href="/app">Open Control Plane</Link>
            <Link href="/docs">Docs</Link>
          </div>
        </div>
      </section>
      <section className="grid">
        <article className="panel wide">
          <header>
            <div>
              <h2>CHANGELOG.md</h2>
              <p>Served directly from the repository.</p>
            </div>
          </header>
          <pre className="docPre">{changelog}</pre>
        </article>
      </section>
    </main>
  );
}
