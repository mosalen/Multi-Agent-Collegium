// arXiv search tool for MAC agents — free, no API key needed

export async function searchArxiv(query, maxResults = 5) {
  const url = `https://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(query)}&start=0&max_results=${maxResults}&sortBy=relevance&sortOrder=descending`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`arXiv API error: ${resp.status}`);

  const xml = await resp.text();
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, "text/xml");
  const entries = doc.querySelectorAll("entry");

  const results = [];
  for (const entry of entries) {
    results.push({
      title: entry.querySelector("title")?.textContent?.trim().replace(/\s+/g, " ") || "",
      authors: Array.from(entry.querySelectorAll("author > name")).map(n => n.textContent.trim()).join(", "),
      summary: (entry.querySelector("summary")?.textContent?.trim().replace(/\s+/g, " ") || "").slice(0, 300),
      url: entry.querySelector("id")?.textContent?.trim() || "",
      published: entry.querySelector("published")?.textContent?.slice(0, 10) || "",
    });
  }
  return results;
}

export function formatSearchResults(results) {
  if (!results?.length) return "[arXiv: No results found]";
  let text = `\n📚 arXiv Results (${results.length} papers):\n`;
  results.forEach((r, i) => {
    text += `\n${i + 1}. "${r.title}"`;
    if (r.authors) text += `\n   ${r.authors} (${r.published?.slice(0, 4) || "?"})`;
    if (r.summary) text += `\n   ${r.summary}`;
    if (r.url) text += `\n   ${r.url}`;
    text += "\n";
  });
  return text;
}
