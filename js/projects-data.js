/*
  Add a new project by adding an object to this array — no HTML editing needed.

  Fields:
    title   - project name
    status  - "live" | "building" | "concept"   (controls the status label)
    desc    - one or two sentences
    tags    - array of short strings (tech, category, etc.)
    link    - optional URL; omit or set to "" if there's nothing to link to yet
    linkLabel - optional label for the link (defaults to "View ->")
*/
const PROJECTS = [];

function statusLabel(status) {
  return { live: "Live", building: "Building", concept: "Concept" }[status] || status;
}

function renderProjects() {
  const grid = document.getElementById("projectGrid");
  if (!grid) return;

  grid.innerHTML = PROJECTS.map((p) => `
    <div class="entry reveal">
      <span class="entry-status status-${p.status}">${statusLabel(p.status)}</span>
      <div class="entry-body">
        <h3>${p.title}</h3>
        <p>${p.desc}</p>
        ${p.tags && p.tags.length ? `<div class="entry-tags">${p.tags.join(" · ")}</div>` : ""}
      </div>
      ${p.link ? `<a class="entry-link" href="${p.link}" target="_blank" rel="noopener">${p.linkLabel || "View ↗"}</a>` : "<span></span>"}
    </div>
  `).join("") + `
    <div class="entry placeholder reveal">
      <span class="entry-status"></span>
      <div class="entry-body">
        <h3>More on the way</h3>
        <p>Extensions and mini-apps land here as they ship. Edit <code>js/projects-data.js</code> to add one.</p>
      </div>
      <span></span>
    </div>
  `;
}

document.addEventListener("DOMContentLoaded", renderProjects);
