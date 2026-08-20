/*
  Add a new project by adding an object to this array — no HTML editing needed.

  Fields:
    title   - project name
    desc    - one or two sentences
    thumb   - path to a wide (600x320) thumbnail illustration
    tags    - optional array of short strings (tech, category, etc.) — only
              include verified, real metadata
    link    - optional URL; omit or set to "" if there's nothing to link to yet
    linkLabel - optional label for the link (defaults to "View ->")
*/
const PROJECTS = [
  {
    title: "HALAJ — medical report to structured data",
    desc: "NLP pipeline that converts unstructured clinical reports into reliable, structured data.",
    thumb: "assets/project-halaj.svg",
  },
  {
    title: "D-CLA — diabetes clinical learning assistant",
    desc: "LLM-powered assistant that supports reasoning, guideline-informed decisions, and learning.",
    thumb: "assets/project-dcla.svg",
  },
  {
    title: "Kidney Transplant Journey Platform",
    desc: "Patient-centered platform that simplifies education, tracking, and communication across the transplant journey.",
    thumb: "assets/project-transplant.svg",
  },
];

function renderProjects() {
  const grid = document.getElementById("projectGrid");
  if (!grid) return;

  grid.innerHTML = PROJECTS.map((p) => `
    <article class="work-card reveal">
      <span class="work-thumb">
        <img src="${p.thumb}" alt="" width="600" height="320" loading="lazy">
      </span>
      <h3>${p.title}</h3>
      <p>${p.desc}</p>
      ${p.tags && p.tags.length ? `<div class="work-meta">${p.tags.join(" · ")}</div>` : ""}
      ${p.link ? `<a class="entry-link" href="${p.link}" target="_blank" rel="noopener">${p.linkLabel || "View ↗"}</a>` : ""}
    </article>
  `).join("");
}

document.addEventListener("DOMContentLoaded", renderProjects);
