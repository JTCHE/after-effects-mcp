import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

type Scope = "expressions" | "scripting";

// docsforadobe.dev is mkdocs over these two repos; raw markdown is far cheaper
// than fetching the rendered HTML site.
const REPOS: Record<Scope, string> = {
  expressions: "after-effects-expression-reference",
  scripting: "after-effects-scripting-guide"
};

interface DocEntry {
  id: string; // e.g. "expressions/text/style"
  scope: Scope;
  docPath: string; // e.g. "docs/text/style.md"
}

let treeCache: DocEntry[] | null = null;
const contentCache = new Map<string, string>();

async function loadTree(): Promise<DocEntry[]> {
  if (treeCache) return treeCache;
  const entries: DocEntry[] = [];
  for (const [scope, repo] of Object.entries(REPOS) as [Scope, string][]) {
    const res = await fetch(`https://api.github.com/repos/docsforadobe/${repo}/git/trees/master?recursive=1`);
    if (!res.ok) throw new Error(`Failed to list ${scope} docs (${res.status})`);
    const json = (await res.json()) as { tree: { path: string; type: string }[] };
    for (const item of json.tree) {
      if (item.type === "blob" && item.path.startsWith("docs/") && item.path.endsWith(".md")) {
        const id = `${scope}/${item.path.slice("docs/".length, -".md".length)}`;
        entries.push({ id, scope, docPath: item.path });
      }
    }
  }
  treeCache = entries;
  return entries;
}

async function fetchDoc(entry: DocEntry): Promise<string> {
  const cached = contentCache.get(entry.id);
  if (cached !== undefined) return cached;
  const res = await fetch(`https://raw.githubusercontent.com/docsforadobe/${REPOS[entry.scope]}/master/${entry.docPath}`);
  if (!res.ok) throw new Error(`Failed to fetch ${entry.id} (${res.status})`);
  const text = await res.text();
  contentCache.set(entry.id, text);
  return text;
}

function titleOf(markdown: string): string {
  return markdown.match(/^#\s+(.+)$/m)?.[1].trim() ?? "";
}

export function registerDocsTools(server: McpServer) {
  server.tool(
    "search-ae-docs",
    "Search the official After Effects docs (docsforadobe.dev — the expression-engine reference and the ExtendScript " +
    "scripting guide) and return raw markdown, not rendered HTML. Check this BEFORE guessing expression/scripting " +
    "syntax by trial and error — e.g. text style enums, property match names, method signatures. A confident single " +
    "match returns the full page; an ambiguous query returns a short list of candidate doc ids — call again with " +
    "`path` set to one to fetch it.",
    {
      query: z.string().optional().describe("Keywords to search for, e.g. 'text style justification' or 'loopOut'. Omit if passing `path` directly."),
      path: z.string().optional().describe("Exact doc id from a previous search result (e.g. 'expressions/text/style') to fetch that page directly, skipping search."),
      scope: z.enum(["expressions", "scripting", "both"]).default("both").describe("expressions = the expression engine used inside setExpressions/setLayerExpression. scripting = the ExtendScript object model used inside run-jsx/run-script.")
    },
    async ({ query, path, scope }) => {
      try {
        const tree = await loadTree();

        if (path) {
          const entry = tree.find(e => e.id === path);
          if (!entry) {
            return { content: [{ type: "text", text: `No doc page with id "${path}". Run search-ae-docs with a query first to find valid ids.` }], isError: true };
          }
          return { content: [{ type: "text", text: await fetchDoc(entry) }] };
        }

        if (!query) {
          return { content: [{ type: "text", text: "Provide a `query` or a `path`." }], isError: true };
        }

        const scopes: Scope[] = scope === "both" ? ["expressions", "scripting"] : [scope];
        const pool = tree.filter(e => scopes.includes(e.scope));
        const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);

        const scored = pool
          .map(e => ({ e, score: tokens.filter(t => e.id.toLowerCase().includes(t)).length }))
          .filter(s => s.score > 0)
          .sort((a, b) => b.score - a.score);

        if (scored.length > 0 && scored[0].score === tokens.length && (scored.length === 1 || scored[0].score > scored[1].score)) {
          const text = await fetchDoc(scored[0].e);
          return { content: [{ type: "text", text: `[matched: ${scored[0].e.id}]\n\n${text}` }] };
        }

        if (scored.length > 0) {
          const top = scored.slice(0, 8);
          const lines = await Promise.all(top.map(async ({ e }) => `- \`${e.id}\` — ${titleOf(await fetchDoc(e)) || e.id}`));
          return { content: [{ type: "text", text: `Multiple pages match "${query}". Call search-ae-docs again with \`path\` set to one of these ids:\n\n${lines.join("\n")}` }] };
        }

        // No path match — fall back to full-text search (fetches pages lazily, cached after).
        const needle = tokens[0] ?? "";
        const hits: { e: DocEntry; snippet: string }[] = [];
        for (const e of pool) {
          const text = (await fetchDoc(e)).toLowerCase();
          const idx = text.indexOf(needle);
          if (idx !== -1) {
            hits.push({ e, snippet: text.slice(Math.max(0, idx - 60), idx + 100).replace(/\s+/g, " ") });
            if (hits.length >= 8) break;
          }
        }
        if (hits.length === 0) {
          return { content: [{ type: "text", text: `No docs matched "${query}" in scope "${scope}". Try a broader keyword.` }] };
        }
        const lines = hits.map(({ e, snippet }) => `- \`${e.id}\` — …${snippet}…`);
        return { content: [{ type: "text", text: `No page-id match, but full-text search found:\n\n${lines.join("\n")}\n\nCall again with \`path\` set to one of these ids to fetch its full content.` }] };
      } catch (error) {
        return { content: [{ type: "text", text: `Error searching AE docs: ${String(error)}` }], isError: true };
      }
    }
  );
}
