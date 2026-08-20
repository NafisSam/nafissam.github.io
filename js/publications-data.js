/*
  Add a new publication by adding an object to this array — no HTML editing needed.
  Only verified, published work belongs here — do not add anything unconfirmed.

  Fields:
    title   - full publication title
    journal - journal name, with year in parentheses when known (don't invent one)
    badge   - "first-author" | "shared-first-author" | omit/"" for none
    link    - URL to the publication (DOI, publisher page, or PubMed — whichever
              is the correct/available one; don't substitute a different link type)
*/
const PUBLICATIONS = [
  {
    title: "Antidiabetic Agents and Stroke Risk in Type 2 Diabetes: A Narrative Review of Mechanisms, Evidence, and Clinical Implications",
    journal: "Studies in Multidisciplinary Medical Research (2025)",
    badge: "first-author",
    link: "https://www.simmr.info/article_225429.html",
  },
  {
    title: "The prevalence of educational burnout, depression, anxiety, and stress among medical students of the Islamic Azad University in Tehran, Iran",
    journal: "BMC Medical Education (2021)",
    link: "https://www.ncbi.nlm.nih.gov/pmc/articles/PMC8418739/",
  },
  {
    title: "Dermatological adverse effects of ventriculoperitoneal shunt: A Systematic Review",
    journal: "World Neurosurgery",
    badge: "first-author",
    link: "https://www.sciencedirect.com/science/article/pii/S1878875025001846",
  },
  {
    title: "Electrical lymph node scanning (ELS) system for real-time intra-operative detection of involved axillary lymph nodes in adjuvant breast cancer patients",
    journal: "Scientific Reports (2024)",
    link: "https://www.nature.com/articles/s41598-024-61600-7",
  },
  {
    title: "Flavonoids against depression: a comprehensive review of literature",
    journal: "Frontiers in Pharmacology (2024)",
    link: "https://doi.org/10.3389/fphar.2024.1411168",
  },
  {
    title: "Unlocking the Genetic Code: A Systematic Review and Bioinformatic Analysis of the MS4A Gene Cluster's Role in Alzheimer's Disease",
    journal: "Current Genetic Medicine Reports",
    badge: "shared-first-author",
    link: "https://link.springer.com/article/10.1007/s40142-026-00240-x",
  },
  {
    title: "Intraoperative Assessment of High-Risk Thyroid Nodules Based on Electrical Impedance Measurements: A Feasibility Study",
    journal: "Diagnostics (2022)",
    link: "https://pubmed.ncbi.nlm.nih.gov/36552958/",
  },
  {
    title: "Evaluation of curcumin-based ophthalmic nano-emulsion on atropine-induced dry eye in mice",
    journal: "Heliyon (2024)",
    link: "https://pubmed.ncbi.nlm.nih.gov/38601632/",
  },
  {
    title: "Formulation and evaluation of the effects of ophthalmic nanoemulsion of Nigella sativa seed extract on atropine-induced dry eye in mice",
    journal: "Phytomedicine Plus (2024)",
    link: "https://www.sciencedirect.com/science/article/pii/S2667031324000198",
  },
  {
    title: "COVID-19 delirium versus non-COVID-19 delirium in Iran: a computational approach",
    journal: "Acute and Critical Care (2025)",
    link: "https://www.accjournal.org/journal/view.php?doi=10.4266%2Facc.004944",
  },
  {
    title: "Natural STAT3 inhibitors for cancer treatment: A narrative review",
    journal: "Recent Patents on Anti-Cancer Drug Discovery",
    link: "https://www.benthamdirect.com/content/journals/pra/10.2174/1574892818666230803100554",
  },
  {
    title: "Anti-breast cancer potential of honey: A narrative review",
    journal: "OncoReview (2022)",
    link: "https://www.journalsmededu.pl/index.php/OncoReview/article/view/1744",
  },
  {
    title: "Different effects of the Toxoplasma on rats: A review",
    journal: "Clinical Medicine and Health Research Journal",
    link: "https://cmhrj.com/index.php/cmhrj/article/view/33",
  },
];

function publicationBadgeLabel(badge) {
  return { "first-author": "First Author", "shared-first-author": "Shared First Author" }[badge] || "";
}

function publicationBadgeClass(badge) {
  // Reuses the existing entry-status pill colors (status-live / status-concept)
  // — same visual pattern as project/tool status pills, new label text.
  return { "first-author": "status-live", "shared-first-author": "status-concept" }[badge] || "";
}

function renderPublications() {
  const grid = document.getElementById("publicationsGrid");
  if (!grid) return;

  grid.innerHTML = PUBLICATIONS.map((pub) => {
    const badgeLabel = publicationBadgeLabel(pub.badge);
    return `
    <div class="entry reveal">
      <span class="entry-status ${publicationBadgeClass(pub.badge)}">${badgeLabel}</span>
      <div class="entry-body">
        <h3>${pub.title}</h3>
        <p>${pub.journal}</p>
        <div class="entry-tags">Nafiseh Sami, et al.</div>
      </div>
      <a class="entry-link" href="${pub.link}" target="_blank" rel="noopener">View ↗</a>
    </div>
  `;
  }).join("");
}

document.addEventListener("DOMContentLoaded", renderPublications);
