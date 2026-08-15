/*
  Add a new research tool by adding an object to this array — no HTML editing needed.

  Fields:
    title   - tool name / headline (can be a full sentence, wraps fine)
    status  - "live" | "building" | "concept"   (controls the status label)
    desc    - one or two sentences on what it does
    tags    - array of short strings
    link    - optional URL; omit or set to "" if there's nothing to link to yet
    linkLabel - optional label for the link (defaults to "View ->")
*/
const RESEARCH_TOOLS = [
  {
    title: "Review your paper rigorously, mentor-style, and get constructive, ready-to-use feedback",
    status: "live",
    desc: "Paste your manuscript, get instant mentor-style feedback — tiered by priority. No AI, no upload to a server: it runs as transparent rules, right in your browser.",
    tags: ["Manuscript Review", "Runs In-Browser", "No AI"],
    link: "tools/manuscript-review.html",
    linkLabel: "Try it ↗",
  },
];

function toolStatusLabel(status) {
  return { live: "Live", building: "Building", concept: "Concept" }[status] || status;
}

function renderResearchTools() {
  const grid = document.getElementById("toolGrid");
  if (!grid) return;

  grid.innerHTML = RESEARCH_TOOLS.map((t) => `
    <div class="entry reveal">
      <span class="entry-status status-${t.status}">${toolStatusLabel(t.status)}</span>
      <div class="entry-body">
        <h3>${t.title}</h3>
        <p>${t.desc}</p>
        ${t.tags && t.tags.length ? `<div class="entry-tags">${t.tags.join(" · ")}</div>` : ""}
      </div>
      ${t.link ? `<a class="entry-link" href="${t.link}" target="_blank" rel="noopener">${t.linkLabel || "View ↗"}</a>` : "<span></span>"}
    </div>
  `).join("") + `
    <div class="entry placeholder reveal">
      <span class="entry-status"></span>
      <div class="entry-body">
        <h3>More tools on the way</h3>
        <p>New research tools land here as they ship. Edit <code>js/research-tools-data.js</code> to add one.</p>
      </div>
      <span></span>
    </div>
  `;
}

document.addEventListener("DOMContentLoaded", renderResearchTools);
