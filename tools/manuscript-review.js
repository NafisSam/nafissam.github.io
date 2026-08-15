/*
  Rule-based manuscript reviewer.
  Everything here is deterministic string/regex analysis — no model, no network call.
  Add or tune a check by editing one of the `check*` functions below; each returns
  an array of { text, quote, fix } items and gets slotted into a Critical/Major/Minor tier.
*/

/* ---------- example manuscript (for the "Load example" button) ---------- */

const EXAMPLE_MANUSCRIPT = `Abstract
This randomized controlled trial evaluated whether a structured SMS reminder program improves medication adherence in patients with T2DM. Due to the fact that adherence is a major barrier to glycemic control, we enrolled n=140 patients across two outpatient clinics. Patients in the intervention arm showed significant improvement in adherence compared to the control group [1][2].

Introduction
Type 2 diabetes mellitus is a major global health burden. A number of studies have linked poor medication adherence to worse glycemic outcomes. In order to address this gap, we designed a pragmatic RCT testing a low-cost SMS reminder intervention.

Methods
Eligible patients were randomized to receive either daily SMS reminders or usual care. The primary outcome was adherence, measured using the MMAS-8 at 12 weeks. Sample size was calculated to detect a 15% difference in adherence with 80% power. n=140 patients were allocated across two sites.

Results
Of the enrolled patients, n=118 completed the 12-week follow-up. Adherence scores were significantly higher in the intervention group. Baseline characteristics were similar between groups. A majority of participants in the intervention arm reported the reminders were useful.

Discussion
It is important to note that this study has several limitations, including a relatively short follow-up period and reliance on self-reported adherence. Nonetheless, the the results suggest SMS reminders may be a low-cost tool to improve adherence in resource-limited settings.

References
1. Alvarez R, Chen P. SMS interventions in chronic disease management. 2021.
2. Osei K. Medication adherence in type 2 diabetes: a review. 2019.
4. Patel S. mHealth in low-resource settings. 2020.`;

/* ---------- research type taxonomy ----------
   The reviewer (rule-based and AI) always applies two layers: a Universal
   layer (compliance items every manuscript type needs) plus a type-specific
   layer keyed to the manuscript's actual reporting guideline. The user
   selects the type explicitly — we don't try to auto-detect it, since the
   consequence of guessing wrong (checking a paper against the wrong
   guideline) is worse than asking. */

const RESEARCH_TYPES = {
  review: {
    label: "Review",
    subtypes: {
      systematic: { label: "Systematic review", guidelineName: "PRISMA 2020", checklistKey: "PRISMA" },
      scoping: { label: "Scoping review", guidelineName: "PRISMA-ScR", checklistKey: "PRISMA_SCR" },
      narrative: { label: "Narrative review", guidelineName: "SANRA", checklistKey: "SANRA" },
      umbrella: { label: "Umbrella review", guidelineName: "PRISMA 2020 (adapted) + AMSTAR-2", checklistKey: "UMBRELLA" },
    },
  },
  original: {
    label: "Original research",
    subtypes: {
      rct: { label: "Randomized controlled trial (RCT)", guidelineName: "CONSORT", checklistKey: "CONSORT" },
      observational: { label: "Observational study (cohort / case-control / cross-sectional)", guidelineName: "STROBE", checklistKey: "STROBE" },
      diagnostic: { label: "Diagnostic accuracy study", guidelineName: "STARD", checklistKey: "STARD" },
      other: { label: "Other / general original research", guidelineName: null, checklistKey: null },
    },
  },
};

function getSubtypeConfig(groupKey, subtypeKey) {
  const group = RESEARCH_TYPES[groupKey];
  if (!group) return null;
  const subtype = group.subtypes[subtypeKey];
  if (!subtype) return null;
  return { groupKey, subtypeKey, groupLabel: group.label, ...subtype };
}

/* ---------- text helpers ---------- */

function splitSentences(text) {
  return text
    .replace(/\s+/g, " ")
    .trim()
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"'(])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 2);
}

function countWords(text) {
  const words = text.trim().match(/[A-Za-z0-9'-]+/g);
  return words ? words.length : 0;
}

function countSyllables(word) {
  const w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (w.length <= 3) return 1;
  const stripped = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "");
  const groups = stripped.match(/[aeiouy]{1,2}/g);
  return groups ? Math.max(groups.length, 1) : 1;
}

function fleschReadingEase(text, wordCount, sentenceCount) {
  const words = text.match(/[A-Za-z'-]+/g) || [];
  const syllables = words.reduce((sum, w) => sum + countSyllables(w), 0);
  if (wordCount === 0 || sentenceCount === 0) return null;
  return 206.835 - 1.015 * (wordCount / sentenceCount) - 84.6 * (syllables / wordCount);
}

function readabilityLabel(score) {
  if (score === null) return "n/a";
  if (score >= 70) return "Easy to read (unusually plain for academic writing)";
  if (score >= 50) return "Fairly accessible";
  if (score >= 30) return "Difficult — typical for academic/clinical writing";
  return "Very dense — consider shortening sentences";
}

function truncate(s, n) {
  return s.length > n ? s.slice(0, n).trim() + "…" : s;
}

/* ---------- individual checks ---------- */

const SECTION_PATTERNS = [
  { name: "Abstract", re: /^abstract\b/i },
  { name: "Introduction", re: /^(introduction|background)\b/i },
  { name: "Methods", re: /^(methods|methodology|materials and methods|study design)\b/i },
  { name: "Results", re: /^results\b/i },
  { name: "Discussion", re: /^discussion\b/i },
  { name: "Conclusion", re: /^conclusions?\b/i },
  { name: "References", re: /^(references|bibliography)\b/i },
];

function detectSections(text) {
  const found = new Set();
  text.split(/\n/).forEach((line) => {
    const trimmed = line.trim().replace(/^[\d.\sIVX]+[).]?\s*/, "");
    if (trimmed.length === 0 || trimmed.length > 60) return;
    for (const p of SECTION_PATTERNS) {
      if (p.re.test(trimmed)) found.add(p.name);
    }
  });
  return found;
}

function checkStructure(text, wordCount) {
  const items = [];
  if (wordCount < 350) return items; // too short to expect IMRaD structure

  const found = detectSections(text);
  if (found.size === 0) {
    items.push({
      text: "No section headers detected (Introduction, Methods, Results, Discussion...).",
      fix: "If this is a full manuscript, add clear section headers on their own line — reviewers scan structure before content.",
    });
    return items;
  }

  const core = ["Introduction", "Methods", "Results", "Discussion"];
  const missing = core.filter((s) => !found.has(s));
  if (missing.length) {
    items.push({
      text: `Missing expected section${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}.`,
      fix: "Standard IMRaD structure helps reviewers and readers navigate the manuscript quickly.",
    });
  }
  return items;
}

function checkAbstractLength(text) {
  const items = [];
  const match = text.match(/abstract\b[:\s]*\n?([\s\S]*?)(?:\n\s*\n|\n(?:introduction|background)\b)/i);
  if (!match) return items;
  const abstractWords = countWords(match[1]);
  if (abstractWords > 300) {
    items.push({
      text: `Abstract is ${abstractWords} words.`,
      fix: "Most journals cap abstracts at 250–300 words — trim before submission (check target journal's exact limit).",
    });
  }
  return items;
}

function checkSignificanceClaims(sentences) {
  const items = [];
  sentences.forEach((s) => {
    if (/\bsignificant(ly)?\b/i.test(s) && !/\bp\s*[<=>]\s*0?\.\d+/i.test(s) && !/\bnot\s+significant/i.test(s)) {
      items.push({
        text: "Claims statistical significance without a nearby p-value.",
        quote: truncate(s, 140),
        fix: "Report the test statistic and exact p-value (e.g., \"p = 0.03\") alongside any significance claim.",
      });
    }
  });
  return items.slice(0, 5);
}

function checkAbbreviations(text) {
  const items = [];
  const defined = new Set();
  const defRe = /\(([A-Z]{2,6})\)/g;
  let m;
  while ((m = defRe.exec(text))) defined.add(m[1]);

  const tokenCounts = {};
  const tokenRe = /\b[A-Z]{2,6}\b/g;
  while ((m = tokenRe.exec(text))) {
    tokenCounts[m[0]] = (tokenCounts[m[0]] || 0) + 1;
  }

  const ignore = new Set(["I", "A"]);
  const suspects = Object.keys(tokenCounts).filter(
    (t) => tokenCounts[t] > 1 && !defined.has(t) && !ignore.has(t)
  );
  if (suspects.length) {
    items.push({
      text: `Possibly undefined abbreviation${suspects.length > 1 ? "s" : ""}: ${suspects.slice(0, 8).join(", ")}.`,
      fix: "Spell out every abbreviation at first use, followed by the short form in parentheses.",
    });
  }
  return items;
}

function checkSampleSizeConsistency(text) {
  const items = [];
  const sections = ["Abstract", "Methods", "Results"];
  const found = {};

  sections.forEach((name, idx) => {
    const re = new RegExp(`\\b${name}\\b`, "i");
    const start = text.search(re);
    if (start === -1) return;
    const nextNames = sections.slice(idx + 1).concat(["Discussion", "Conclusion", "References"]);
    let end = text.length;
    nextNames.forEach((n) => {
      const m = text.slice(start + name.length).search(new RegExp(`\\b${n}\\b`, "i"));
      if (m !== -1) end = Math.min(end, start + name.length + m);
    });
    const chunk = text.slice(start, end);
    const nums = [...chunk.matchAll(/\bn\s*=\s*(\d{1,6})\b/gi)].map((m) => parseInt(m[1], 10));
    if (nums.length) found[name] = Math.max(...nums);
  });

  const values = Object.entries(found);
  if (values.length >= 2) {
    const distinct = new Set(values.map(([, v]) => v));
    if (distinct.size > 1) {
      items.push({
        text: `Sample size differs across sections: ${values.map(([s, v]) => `${s}=${v}`).join(", ")}.`,
        fix: "If this is due to attrition/exclusions, state it explicitly (e.g., \"of the 120 enrolled, 95 completed follow-up\"). If it's inconsistent by mistake, reconcile the numbers.",
      });
    }
  }
  return items;
}

const NUMBERED_CITATION_RE = /\[(\d+(?:\s*[-,]\s*\d+)*)\]/g;

function extractReferencesSection(text) {
  const match = text.match(/\n\s*(?:references|bibliography)\s*\n([\s\S]*)$/i);
  return match ? match[1] : "";
}

function checkCitationReferenceMatch(text) {
  const items = [];
  const refSection = extractReferencesSection(text);
  if (!refSection) return items;

  const bodyText = text.slice(0, text.length - refSection.length);

  const citedNumbers = new Set();
  let m;
  const re = new RegExp(NUMBERED_CITATION_RE);
  while ((m = re.exec(bodyText))) {
    m[1].split(",").forEach((part) => {
      const range = part.trim().split("-").map((n) => parseInt(n.trim(), 10));
      if (range.length === 2 && !isNaN(range[0]) && !isNaN(range[1])) {
        for (let i = range[0]; i <= range[1]; i++) citedNumbers.add(i);
      } else if (!isNaN(range[0])) {
        citedNumbers.add(range[0]);
      }
    });
  }

  if (citedNumbers.size === 0) return items; // not using numeric citation style

  const definedNumbers = new Set();
  refSection.split(/\n/).forEach((line) => {
    const lm = line.trim().match(/^\[?(\d+)[\].]?\s+\S/);
    if (lm) definedNumbers.add(parseInt(lm[1], 10));
  });

  if (definedNumbers.size === 0) return items;

  const undefinedCites = [...citedNumbers].filter((n) => !definedNumbers.has(n)).sort((a, b) => a - b);
  const orphanRefs = [...definedNumbers].filter((n) => !citedNumbers.has(n)).sort((a, b) => a - b);

  if (undefinedCites.length) {
    items.push({
      text: `Citation number${undefinedCites.length > 1 ? "s" : ""} [${undefinedCites.slice(0, 15).join(", ")}] used in text but not found in the reference list.`,
      fix: "Add the missing reference entries, or fix the citation numbers.",
    });
  }
  if (orphanRefs.length) {
    items.push({
      text: `Reference${orphanRefs.length > 1 ? "s" : ""} [${orphanRefs.slice(0, 15).join(", ")}] listed but never cited in the text.`,
      fix: "Remove unused references, or add the missing in-text citation.",
    });
  }
  return items;
}

/* ---------- reporting-guideline checklists ----------
   Keyed by checklistKey (see RESEARCH_TYPES above). These are heuristic
   keyword checks, not proof of compliance — the UI says so explicitly.
   A "?" means the keyword wasn't found; it doesn't mean the item is absent. */

const UNIVERSAL_CHECKLIST_ITEMS = [
  { item: "Data Availability Statement", kw: [/\bdata availability\b/i, /\bdata are available\b/i, /\bavailable (upon|on) (reasonable )?request\b/i] },
  { item: "Ethics approval / informed consent (or explicit non-applicability)", kw: [/\bethic(s|al) approval\b/i, /\binformed consent\b/i, /\b(institutional review board|IRB|ethics committee)\b/i, /\bdid not require ethical approval\b/i] },
  { item: "Author contribution statement (CRediT or equivalent)", kw: [/\bauthor contributions?\b/i, /\bCRediT\b/i] },
  { item: "Conflict of interest / funding statement", kw: [/\bconflicts? of interest\b/i, /\bfunding\b/i, /\bno funding was received\b/i] },
];

const GUIDELINE_CHECKLISTS = {
  PRISMA: {
    name: "PRISMA 2020",
    items: [
      { item: "Structured abstract", kw: [/\babstract\b/i] },
      { item: "Rationale for the review", kw: [/\b(rationale|gap in (the )?(literature|evidence))\b/i] },
      { item: "Objectives / PICO stated", kw: [/\b(objective|aim|research question|PICO)\b/i] },
      { item: "Eligibility criteria", kw: [/\b(eligibility|inclusion criteria|exclusion criteria)\b/i] },
      { item: "Information sources / databases", kw: [/\b(PubMed|MEDLINE|Embase|Scopus|Web of Science|Cochrane|database)\b/i] },
      { item: "Search strategy", kw: [/\bsearch (strategy|terms|string)\b/i] },
      { item: "Study selection process", kw: [/\b(screening|dual review|independently screened|selection process)\b/i] },
      { item: "Risk of bias assessment", kw: [/\brisk of bias\b/i, /\bquality assessment\b/i] },
      { item: "Synthesis methods", kw: [/\b(synthesis|pooled|meta-analysis|narrative synthesis)\b/i] },
      { item: "Study flow / numbers screened & included", kw: [/\b(flow diagram|records identified|studies included)\b/i] },
      { item: "Protocol registration (+ any deviations stated)", kw: [/\b(PROSPERO|protocol (was )?registered|registration number)\b/i] },
      { item: "Publication bias addressed", kw: [/\bpublication bias\b/i, /\bfunnel plot\b/i] },
      { item: "Quality-appraisal tool disclosed", kw: [/\b(AMSTAR|Newcastle-Ottawa|\bNOS\b|GRADE|quality appraisal tool)\b/i] },
      { item: "Limitations discussed", kw: [/\blimitations?\b/i] },
    ],
  },
  PRISMA_SCR: {
    name: "PRISMA-ScR",
    items: [
      { item: "Title identifies the report as a scoping review", kw: [/\bscoping review\b/i] },
      { item: "Structured abstract", kw: [/\babstract\b/i] },
      { item: "Rationale for a scoping (not systematic) approach", kw: [/\brationale\b/i] },
      { item: "Objectives framed as Population/Concept/Context (PCC)", kw: [/\b(population,?\s*concept,?\s*(and\s*)?context|PCC framework)\b/i] },
      { item: "Protocol registration (or explicit statement none exists)", kw: [/\b(protocol (was )?registered|registration|no registered protocol)\b/i] },
      { item: "Eligibility criteria for sources of evidence", kw: [/\beligibility criteria\b/i] },
      { item: "Information sources / search strategy", kw: [/\b(databases?|search strategy|information sources)\b/i] },
      { item: "Data charting process described", kw: [/\bdata charting\b/i, /\bcharting (form|process)\b/i] },
      { item: "Critical appraisal approach stated (even if not performed)", kw: [/\bcritical appraisal\b/i] },
      { item: "Results presented as a charted/tabulated map, not pooled statistics", kw: [/\b(charted|mapped|tabulated) (the )?(results|evidence)\b/i] },
      { item: "Limitations discussed", kw: [/\blimitations?\b/i] },
    ],
  },
  SANRA: {
    name: "SANRA",
    items: [
      { item: "Topic's importance / justification for readers stated", kw: [/\b(importance|significance) of (this|the) (topic|review)\b/i, /\bjustif(y|ies|ication)\b/i] },
      { item: "Specific aims or guiding questions stated", kw: [/\b(aim|purpose|objective) of this (review|article)\b/i] },
      { item: "Literature search approach described", kw: [/\b(literature search|search (was )?conducted|search strategy)\b/i] },
      { item: "Referencing adequate and traceable to claims", kw: [/\breferences?\b/i] },
      { item: "Evidence quality distinguished (e.g., RCT vs. expert opinion)", kw: [/\b(randomi[sz]ed controlled trial|systematic review|expert opinion|level of evidence|quality of evidence)\b/i] },
      { item: "Contrasting / conflicting evidence presented, not just supporting evidence", kw: [/\b(conflicting|contrasting|inconsistent) (evidence|findings|results)\b/i] },
    ],
  },
  UMBRELLA: {
    name: "Umbrella review checklist",
    items: [
      { item: "Explicitly labeled as an umbrella review", kw: [/\bumbrella review\b/i] },
      { item: "Rationale for review-of-reviews synthesis", kw: [/\brationale\b/i] },
      { item: "Protocol registration", kw: [/\b(PROSPERO|protocol (was )?registered)\b/i] },
      { item: "Eligibility criteria for included systematic reviews", kw: [/\beligibility criteria\b/i] },
      { item: "Search strategy / databases for finding reviews", kw: [/\b(databases?|search strategy)\b/i] },
      { item: "Quality appraisal of included reviews (e.g., AMSTAR-2)", kw: [/\bAMSTAR\b/i] },
      { item: "Overlap of primary studies across reviews assessed", kw: [/\b(corrected covered area|overlap of (primary )?studies|citation matrix)\b/i] },
      { item: "Certainty of evidence summarized (e.g., GRADE)", kw: [/\bGRADE\b/i, /\bcertainty of evidence\b/i] },
      { item: "Limitations address overlap / heterogeneity across reviews", kw: [/\bheterogeneity\b/i] },
    ],
  },
  STROBE: {
    name: "STROBE",
    items: [
      { item: "Study design named in title/abstract", kw: [/\b(cohort|case-control|cross-sectional)\b/i] },
      { item: "Background / rationale", kw: [/\b(background|rationale)\b/i] },
      { item: "Objectives stated", kw: [/\b(objective|aim|hypothesis)\b/i] },
      { item: "Setting described", kw: [/\bsetting\b/i] },
      { item: "Participants / eligibility", kw: [/\b(participants|eligibility|inclusion criteria)\b/i] },
      { item: "Variables defined", kw: [/\bvariables?\b/i] },
      { item: "Data sources / measurement", kw: [/\b(data source|measurement|assessed using)\b/i] },
      { item: "Bias addressed", kw: [/\bbias\b/i] },
      { item: "Study size / sample size justification", kw: [/\bsample size\b/i] },
      { item: "Statistical methods", kw: [/\b(statistical (analysis|methods)|regression|t-test|chi-square)\b/i] },
      { item: "Limitations discussed", kw: [/\blimitations?\b/i] },
      { item: "Generalisability", kw: [/\b(generali[sz]ability|external validity)\b/i] },
    ],
  },
  CONSORT: {
    name: "CONSORT",
    items: [
      { item: "Trial design stated", kw: [/\btrial design\b/i, /\b(parallel|crossover) (group|design)\b/i] },
      { item: "Eligibility criteria for participants", kw: [/\b(eligibility|inclusion criteria|exclusion criteria)\b/i] },
      { item: "Interventions described in detail", kw: [/\bintervention\b/i] },
      { item: "Primary / secondary outcomes defined", kw: [/\b(primary outcome|secondary outcome)\b/i] },
      { item: "Sample size calculation", kw: [/\b(sample size|power calculation)\b/i] },
      { item: "Randomization method", kw: [/\brandomi[sz]ation\b/i] },
      { item: "Blinding described", kw: [/\bblind(ed|ing)?\b/i, /\bopen-label\b/i] },
      { item: "Statistical methods", kw: [/\b(statistical (analysis|methods)|intention-to-treat)\b/i] },
      { item: "Participant flow / numbers randomized & analyzed", kw: [/\b(flow diagram|allocated|randomi[sz]ed to)\b/i] },
      { item: "Baseline demographic data", kw: [/\bbaseline (characteristics|data|table)\b/i] },
      { item: "Harms / adverse events reported", kw: [/\b(adverse event|harms?|side effect)\b/i] },
      { item: "Trial registration", kw: [/\b(trial registration|clinicaltrials\.gov|registered)\b/i] },
    ],
  },
  STARD: {
    name: "STARD",
    items: [
      { item: "Identified as a diagnostic accuracy study", kw: [/\bdiagnostic accuracy\b/i] },
      { item: "Index test described in replicable detail", kw: [/\bindex test\b/i] },
      { item: "Reference standard described in replicable detail", kw: [/\breference standard\b/i] },
      { item: "Test-positivity cut-offs stated", kw: [/\b(cut-?off|threshold)\b/i] },
      { item: "Participant flow diagram", kw: [/\bflow diagram\b/i, /\bparticipant flow\b/i] },
      { item: "Cross-tabulation of index test vs. reference standard (2x2)", kw: [/\b(2\s*[x×]\s*2|cross-?tabulation|contingency table)\b/i] },
      { item: "Diagnostic accuracy estimates (sensitivity/specificity) with CIs", kw: [/\b(sensitivity|specificity)\b/i] },
      { item: "Adverse events reported", kw: [/\badverse events?\b/i] },
      { item: "Study registration", kw: [/\bregist(ered|ration)\b/i] },
    ],
  },
};

function runGuidelineChecklists(text, subtype) {
  const groups = [
    {
      name: "Universal — every manuscript type",
      items: UNIVERSAL_CHECKLIST_ITEMS.map((it) => ({ item: it.item, found: it.kw.some((re) => re.test(text)) })),
    },
  ];
  if (subtype && subtype.checklistKey) {
    const g = GUIDELINE_CHECKLISTS[subtype.checklistKey];
    if (g) {
      groups.push({
        name: `${g.name} — ${subtype.label}`,
        items: g.items.map((it) => ({ item: it.item, found: it.kw.some((re) => re.test(text)) })),
      });
    }
  }
  return groups;
}

const IRREGULAR_PARTICIPLES = "done|made|given|taken|written|seen|known|shown|found|held|kept|sent|brought|built|chosen|said|told|used|born";

function checkPassiveVoice(sentences) {
  const passiveRe = new RegExp(`\\b(is|are|was|were|be|been|being)\\s+(\\w+ed|${IRREGULAR_PARTICIPLES})\\b`, "i");
  const passiveCount = sentences.filter((s) => passiveRe.test(s)).length;
  const ratio = sentences.length ? passiveCount / sentences.length : 0;
  const items = [];
  if (ratio > 0.5 && sentences.length >= 6) {
    items.push({
      text: `About ${Math.round(ratio * 100)}% of sentences use passive voice.`,
      fix: "Favor active voice where it doesn't obscure methodology (\"We measured...\" vs. \"It was measured...\") — it reads more directly.",
    });
  }
  return items;
}

const WORDY_PHRASES = [
  [/\bdue to the fact that\b/gi, "because"],
  [/\bin order to\b/gi, "to"],
  [/\ba majority of\b/gi, "most"],
  [/\ba number of\b/gi, "several"],
  [/\bat this point in time\b/gi, "now"],
  [/\bin the event that\b/gi, "if"],
  [/\bfor the purpose of\b/gi, "to"],
  [/\bin spite of the fact that\b/gi, "although"],
  [/\butiliz(e|ed|ing|ation)\b/gi, "use"],
  [/\bit is important to note that\b/gi, "(often can be cut)"],
];

function checkWordyPhrases(text) {
  const items = [];
  WORDY_PHRASES.forEach(([re, suggestion]) => {
    const matches = text.match(re);
    if (matches) {
      items.push({
        text: `"${matches[0]}" appears ${matches.length}x.`,
        fix: `Consider "${suggestion}" instead.`,
      });
    }
  });
  return items.slice(0, 6);
}

function checkLongSentences(sentences) {
  const items = [];
  sentences.forEach((s) => {
    const wc = countWords(s);
    if (wc > 40) {
      items.push({
        text: `Sentence is ${wc} words.`,
        quote: truncate(s, 160),
        fix: "Split into two sentences — anything past ~35 words gets hard to parse on a first read.",
      });
    }
  });
  return items.slice(0, 5);
}

function checkRepeatedWords(text) {
  const items = [];
  const re = /\b(\w+)\s+\1\b/gi;
  let m;
  const seen = new Set();
  while ((m = re.exec(text))) {
    if (!seen.has(m[0].toLowerCase())) {
      seen.add(m[0].toLowerCase());
      items.push({ text: `Repeated word: "${m[0]}".`, fix: "Likely a typo — remove the duplicate." });
    }
  }
  return items.slice(0, 5);
}

function checkNumeralStart(sentences) {
  const items = [];
  const offenders = sentences.filter((s) => /^\d/.test(s.trim()));
  if (offenders.length) {
    items.push({
      text: `${offenders.length} sentence${offenders.length > 1 ? "s" : ""} start with a numeral.`,
      quote: truncate(offenders[0], 100),
      fix: "Spell out numbers that start a sentence, or rephrase.",
    });
  }
  return items;
}

/* ---------- orchestration ---------- */

function runReview(rawText, subtype) {
  const text = rawText.trim();
  const wordCount = countWords(text);
  const sentences = splitSentences(text);
  const sentenceCount = sentences.length;
  const avgSentenceLen = sentenceCount ? Math.round(wordCount / sentenceCount) : 0;
  const readability = fleschReadingEase(text, wordCount, sentenceCount);

  const critical = [
    ...checkStructure(text, wordCount),
  ];

  const major = [
    ...checkSignificanceClaims(sentences),
    ...checkAbbreviations(text),
    ...checkAbstractLength(text),
    ...checkSampleSizeConsistency(text),
    ...checkCitationReferenceMatch(text),
  ];

  const minor = [
    ...checkLongSentences(sentences),
    ...checkPassiveVoice(sentences),
    ...checkWordyPhrases(text),
    ...checkRepeatedWords(text),
    ...checkNumeralStart(sentences),
  ];

  const checklists = runGuidelineChecklists(text, subtype);

  return {
    subtype,
    stats: { wordCount, sentenceCount, avgSentenceLen, readability },
    tiers: { critical, major, minor },
    checklists,
  };
}

/* ---------- rendering ---------- */

function statsHtml(stats) {
  const chips = [
    `${stats.wordCount} words`,
    `${stats.sentenceCount} sentences`,
    `~${stats.avgSentenceLen} words/sentence`,
    `Readability: ${readabilityLabel(stats.readability)}`,
  ];
  return chips.map((c) => `<span class="stat-chip">${c}</span>`).join("");
}

function tierHtml(title, key, items) {
  if (!items.length) {
    return `
      <div class="feedback-group tier-${key}">
        <h3><span class="tier-dot"></span>${title}</h3>
        <p class="empty-state" style="padding:10px 0;text-align:left;">No issues found in this category.</p>
      </div>`;
  }
  return `
    <div class="feedback-group tier-${key}">
      <h3><span class="tier-dot"></span>${title} (${items.length})</h3>
      ${items.map((i) => `
        <div class="feedback-item">
          <div class="issue-text">${i.text}</div>
          ${i.quote ? `<span class="issue-quote">"${i.quote}"</span>` : ""}
          <div class="issue-fix">${i.fix}</div>
        </div>
      `).join("")}
    </div>`;
}

function checklistHtml(checklists) {
  if (!checklists.length) {
    return `<p class="empty-state" style="padding:10px 0;text-align:left;">No reporting-guideline-specific study design (RCT, cohort, systematic review, etc.) was detected — nothing to check here.</p>`;
  }
  return checklists.map((c) => `
    <div class="checklist-group">
      <h4>${c.name}</h4>
      <div class="checklist-items">
        ${c.items.map((it) => `
          <div class="checklist-item ${it.found ? "found" : "missing"}">
            <span class="mark">${it.found ? "✓" : "?"}</span>
            <span>${it.item}${it.found ? "" : " — not clearly found"}</span>
          </div>
        `).join("")}
      </div>
    </div>
  `).join("");
}

function checklistToPlainText(checklists) {
  if (!checklists.length) return "No applicable reporting guideline detected.\n";
  const lines = [];
  checklists.forEach((c) => {
    lines.push(`${c.name} checklist:`);
    c.items.forEach((it) => lines.push(`  [${it.found ? "x" : " "}] ${it.item}`));
    lines.push("");
  });
  return lines.join("\n");
}

function feedbackToPlainText(result) {
  const { subtype, stats, tiers, checklists } = result;
  const lines = [];
  lines.push("MANUSCRIPT REVIEW");
  if (subtype) {
    lines.push(`Type: ${subtype.groupLabel} — ${subtype.label}${subtype.guidelineName ? ` (${subtype.guidelineName})` : ""}`);
  }
  lines.push(`${stats.wordCount} words · ${stats.sentenceCount} sentences · ~${stats.avgSentenceLen} words/sentence`);
  lines.push(`Readability: ${readabilityLabel(stats.readability)}`);
  lines.push("");
  [["CRITICAL", tiers.critical], ["MAJOR", tiers.major], ["MINOR", tiers.minor]].forEach(([label, items]) => {
    lines.push(`--- ${label} (${items.length}) ---`);
    if (!items.length) lines.push("None found.");
    items.forEach((i) => {
      lines.push(`- ${i.text}`);
      if (i.quote) lines.push(`  quote: "${i.quote}"`);
      lines.push(`  fix: ${i.fix}`);
    });
    lines.push("");
  });
  lines.push("--- REPORTING-GUIDELINE CHECKLIST ---");
  lines.push(checklistToPlainText(checklists));
  return lines.join("\n");
}

/* ---------- research type selector wiring ---------- */

function populateSubtypeSelect(groupKey) {
  const subtypeSelect = document.getElementById("researchSubtypeSelect");
  const group = RESEARCH_TYPES[groupKey];
  if (!group) {
    subtypeSelect.innerHTML = `<option value="">— Select type first —</option>`;
    subtypeSelect.disabled = true;
    return;
  }
  subtypeSelect.innerHTML =
    `<option value="">— Select —</option>` +
    Object.entries(group.subtypes).map(([key, s]) => `<option value="${key}">${s.label}</option>`).join("");
  subtypeSelect.disabled = false;
}

function getSelectedSubtype() {
  const groupKey = document.getElementById("researchTypeSelect").value;
  const subtypeKey = document.getElementById("researchSubtypeSelect").value;
  if (!groupKey || !subtypeKey) return null;
  return getSubtypeConfig(groupKey, subtypeKey);
}

function showTypeError(msg) {
  const el = document.getElementById("typeSelectError");
  el.textContent = msg;
  el.hidden = false;
}

function clearTypeError() {
  document.getElementById("typeSelectError").hidden = true;
}

function setSelectedSubtype(groupKey, subtypeKey) {
  document.getElementById("researchTypeSelect").value = groupKey;
  populateSubtypeSelect(groupKey);
  document.getElementById("researchSubtypeSelect").value = subtypeKey;
  clearTypeError();
}

/* ---------- UI wiring ---------- */

let lastResultText = "";

function handleReview() {
  const input = document.getElementById("manuscriptInput").value;
  if (!input.trim()) return;

  const subtype = getSelectedSubtype();
  if (!subtype) {
    showTypeError("Please select what kind of research this is first — it determines which reporting guideline gets checked.");
    document.getElementById("researchTypeSelect").scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }
  clearTypeError();

  const result = runReview(input, subtype);
  lastResultText = feedbackToPlainText(result);

  document.getElementById("statsRow").innerHTML = statsHtml(result.stats);
  document.getElementById("feedbackOutput").innerHTML =
    tierHtml("Critical", "critical", result.tiers.critical) +
    tierHtml("Major", "major", result.tiers.major) +
    tierHtml("Minor", "minor", result.tiers.minor);
  document.getElementById("checklistOutput").innerHTML = checklistHtml(result.checklists);
  document.getElementById("checklistIntro").textContent =
    `Reviewed as: ${subtype.groupLabel} — ${subtype.label}${subtype.guidelineName ? ` (${subtype.guidelineName})` : ""}. ` +
    `A "?" means the keyword wasn't found — verify manually, this is a heuristic, not proof of compliance.`;

  document.getElementById("resultsPanel").hidden = false;
  document.getElementById("resultsPanel").scrollIntoView({ behavior: "smooth", block: "start" });
}

/* ---------- file parsing (.docx / .pdf) ---------- */

const loadedScripts = {};

function loadScriptOnce(url) {
  if (loadedScripts[url]) return loadedScripts[url];
  loadedScripts[url] = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = url;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Failed to load ${url}`));
    document.head.appendChild(s);
  });
  return loadedScripts[url];
}

async function extractDocxText(arrayBuffer) {
  await loadScriptOnce("https://cdn.jsdelivr.net/npm/mammoth@1.8.0/mammoth.browser.min.js");
  const result = await window.mammoth.extractRawText({ arrayBuffer });
  return result.value;
}

async function extractPdfText(arrayBuffer) {
  await loadScriptOnce("https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/legacy/build/pdf.min.js");
  const pdfjsLib = window["pdfjs-dist/build/pdf"] || window.pdfjsLib;
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/legacy/build/pdf.worker.min.js";
  const doc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let text = "";
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map((it) => it.str).join(" ") + "\n\n";
  }
  return text;
}

async function handleFileInput(file) {
  const status = document.getElementById("fileStatus");
  const ext = file.name.split(".").pop().toLowerCase();
  const original = status.textContent;
  try {
    if (ext === "txt" || ext === "md") {
      const text = await file.text();
      document.getElementById("manuscriptInput").value = text;
    } else if (ext === "docx") {
      status.textContent = "Loading .docx parser...";
      const buf = await file.arrayBuffer();
      document.getElementById("manuscriptInput").value = await extractDocxText(buf);
      status.textContent = original;
    } else if (ext === "pdf") {
      status.textContent = "Loading .pdf parser...";
      const buf = await file.arrayBuffer();
      document.getElementById("manuscriptInput").value = await extractPdfText(buf);
      status.textContent = original;
    } else {
      status.textContent = "Unsupported file type — use .txt, .md, .docx, or .pdf.";
    }
  } catch (err) {
    status.textContent = `Couldn't read that file (${err.message}). Check your internet connection, or paste the text directly.`;
  }
}

/* ---------- AI review (optional, requires user's own API key) ---------- */

const UNIVERSAL_PROMPT_ITEMS = `
- Data Availability Statement present (or explicit statement of why it doesn't apply).
- Ethics approval / informed consent statement present (or explicit non-applicability, e.g. "did not require ethical approval").
- Author contribution statement (CRediT or equivalent) present.
- Conflict of interest and funding statements present.
- Title accurately scopes the actual content — flag if it promises more, or something different, than the manuscript delivers.
- Abstract contains quantitative specificity (actual numbers/effect sizes), not just qualitative summary.`;

const TYPE_SPECIFIC_PROMPT = {
  systematic: {
    items: `
- Protocol registration stated, with any deviations from the registered protocol explicitly named (state "no deviations occurred" if true — PRISMA 2020 requires this said explicitly, not implied).
- Literature search end-date checked against a plausible submission date; flag a gap of several months or more.
- Publication bias addressed explicitly, even if only to say formal assessment wasn't feasible due to small study count.
- If meta-analysis was not performed, the justification (heterogeneity, small samples, etc.) should appear in Methods or early Results, not buried in Discussion.
- Quality-appraisal tool (NOS, AMSTAR-2, etc.) scoring scale and thresholds explained.
- Screening/appraisal independence and duplication of reviewers stated.
- PICO/PICOS/PECO framing present in the research question.
- Small subgroup sample sizes (n<30) driving a headline claim called out as an explicit limitation.
- Evidence gaps stated at full strength, not softened.`,
  },
  scoping: {
    items: `
- Title identifies the report as a scoping review.
- Structured abstract covering background, objectives, eligibility criteria, sources of evidence, charting methods, results, conclusions.
- Rationale explains why a scoping (not systematic) review was the right choice.
- Objectives use PCC (Population, Concept, Context) framing rather than PICO.
- Protocol registration stated, or an explicit statement that none exists.
- Eligibility criteria for sources of evidence (types, time frame, language) stated.
- Search strategy reproducible; information sources listed.
- Data charting process and data items described.
- Whether critical appraisal of individual sources was performed is stated explicitly (optional in scoping reviews, but the choice must be explicit, not silent).
- Results presented as a charted/tabulated map of the evidence, not pooled/synthesized statistics (pooling would suggest a systematic review, not a scoping one).`,
  },
  narrative: {
    items: `
- The topic's importance/justification for the reader is explicitly stated, not assumed.
- Specific aims or guiding questions of the review are clearly stated.
- The literature search approach is described (source types, time frame, key terms), even though it isn't expected to be systematic.
- Referencing is adequate and traceable to specific claims.
- Evidence is weighted appropriately — higher-quality evidence (RCTs, systematic reviews) is distinguished from lower-quality evidence (case reports, expert opinion), not presented as uniformly authoritative.
- Contrasting or conflicting evidence is presented, not just evidence that supports the review's thesis.`,
  },
  umbrella: {
    items: `
- Explicitly labeled as an umbrella review (review of systematic reviews) in title/abstract.
- Rationale for synthesizing at the review-of-reviews level rather than running a fresh systematic review.
- Protocol registration stated.
- Eligibility criteria for which systematic reviews qualify for inclusion.
- Search strategy and databases for finding systematic reviews.
- Selection process for included reviews, independence/duplication of reviewers.
- Quality appraisal of each included systematic review (e.g., AMSTAR-2) with scoring explained.
- Overlap of primary studies across included reviews assessed (e.g., corrected covered area or a citation matrix) — this is the single most common gap specific to umbrella reviews.
- How conflicting conclusions across included reviews were reconciled is described.
- Certainty of evidence summarized (e.g., GRADE) where feasible.
- Limitations explicitly address overlap and heterogeneity across included reviews, not just within one primary study.`,
  },
  rct: {
    items: `
- Trial design (parallel, crossover, factorial, etc.) stated.
- Eligibility criteria for participants and settings.
- Interventions described in enough detail to replicate.
- Primary and secondary outcomes pre-specified and clearly defined.
- Sample size / power calculation reported.
- Randomization method (sequence generation, allocation concealment) described.
- Blinding described — who was blinded, or explicitly stated as open-label.
- Statistical methods, including whether analysis was intention-to-treat.
- Participant flow (numbers randomized, analyzed, lost to follow-up), ideally as a flow diagram.
- Baseline demographic/clinical data reported by arm.
- Harms/adverse events reported, even if none occurred.
- Trial registration number and registry stated.`,
  },
  observational: {
    items: `
- Study design (cohort, case-control, or cross-sectional) named clearly in the title or abstract.
- Setting, locations, and relevant dates described.
- Participant eligibility criteria and sources/methods of selection.
- Variables (exposures, outcomes, confounders) clearly defined.
- Data sources/measurement methods described, with a note on comparability of methods across groups if more than one.
- Efforts to address bias described.
- Study size and how it was determined.
- Statistical methods, including how confounding was addressed.
- Participant flow through the study (numbers at each stage).
- Generalizability of findings discussed with reference to the actual study population.`,
  },
  diagnostic: {
    items: `
- Title/abstract identifies this as a diagnostic accuracy study.
- Study design (e.g., cross-sectional, case-control) stated.
- Index test and reference standard both described in enough detail to replicate.
- Rationale for the choice of reference standard given.
- Pre-specified test-positivity thresholds/cut-offs stated.
- Participant flow diagram (enrolled → tested → analyzed) present or described.
- Cross-tabulation of index test results against reference standard results (a 2x2 table or equivalent) present.
- Diagnostic accuracy estimates (sensitivity, specificity, predictive values, etc.) reported with confidence intervals.
- Adverse events from the index test or reference standard reported, even if none occurred.
- Study registration stated.`,
  },
  other: { items: "" },
};

function buildAiSystemPrompt(subtype) {
  const specific = TYPE_SPECIFIC_PROMPT[subtype.subtypeKey] || TYPE_SPECIFIC_PROMPT.other;
  const guidelineLine = subtype.guidelineName
    ? `The author has identified this manuscript as a **${subtype.label}**. Apply the **${subtype.guidelineName}** reporting guideline in addition to the universal checklist below.`
    : `The author has identified this manuscript as **${subtype.label}**. No single reporting-guideline extension applies beyond the universal checklist below — evaluate rigor and structure against general original-research standards.`;

  return `You are a senior research mentor conducting a rigorous manuscript review, in the voice of someone who has trained the author through many rounds of detailed revision: demanding about rigor, warm about effort. The goal is to move the draft toward the best version compatible with a top-tier (Q1) journal, not just a cleaner version of itself.

${guidelineLine}

Universal checklist — apply to every manuscript regardless of type:${UNIVERSAL_PROMPT_ITEMS}
${specific.items ? `\n${subtype.label}-specific checklist (${subtype.guidelineName}):${specific.items}\n` : ""}
Core rules:
1. Nothing is approved just because it reads fine — check every quantitative claim, technical term, and cross-reference against what it should actually say. "Consistently associated" is not a finding; "4 of 7 studies, 3 significant" is a finding.
2. Every criticism ships with a fix. One sentence naming the problem and why it matters, then a concrete, ready-to-insert replacement — this is the WHAT → WHY → NEXT pattern. If a fix needs a fact only the author has (an exact p-value, whether a protocol deviation occurred), ask directly rather than inventing a plausible-sounding number.
3. Watch for causal language in observational designs specifically ("improved," "reduced," "caused") — the correct verb there is "associated with." Watch for unquantified claims of association/trend that need an actual count and direction. Watch for a reported SD larger than its mean, or numbers that don't sum or match across sections/tables.
4. Comments are tiered by consequence, not chronology: Critical = will cause desk rejection, invalidates a claim, or is a compliance failure. Major = won't sink the paper but will draw serious reviewer pushback. Minor = typos, redundancy, polish.

Structure your entire response using exactly these three headers, each on its own line:
## CRITICAL
## MAJOR
## MINOR

Under each header, give a bulleted list ("- "). Each bullet must follow WHAT → WHY → NEXT: state the issue, quote or reference the specific part of the text it concerns, explain briefly why it matters, and give a concrete fix.

Do not fabricate facts, citations, or data not present in the text. If you cannot assess something (e.g., a checklist item genuinely can't be evaluated from what's given), say so explicitly rather than guessing. Be direct, specific, and constructive.`;
}

function escapeHtml(s) {
  const div = document.createElement("div");
  div.textContent = s;
  return div.innerHTML;
}

function simpleMarkdownToHtml(md) {
  const lines = escapeHtml(md).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").split("\n");
  let html = "";
  let inList = false;
  lines.forEach((line) => {
    const trimmed = line.trim();
    if (/^[-*]\s+/.test(trimmed)) {
      if (!inList) { html += "<ul>"; inList = true; }
      html += `<li>${trimmed.replace(/^[-*]\s+/, "")}</li>`;
    } else {
      if (inList) { html += "</ul>"; inList = false; }
      if (trimmed) html += `<p>${trimmed}</p>`;
    }
  });
  if (inList) html += "</ul>";
  return html;
}

function renderAiResponse(text) {
  const re = /##\s*(CRITICAL|MAJOR|MINOR)\s*\n([\s\S]*?)(?=##\s*(?:CRITICAL|MAJOR|MINOR)\s*\n|$)/gi;
  const order = { CRITICAL: "critical", MAJOR: "major", MINOR: "minor" };
  let html = "";
  let m;
  let matched = false;
  while ((m = re.exec(text))) {
    matched = true;
    const tier = m[1].toUpperCase();
    html += `<div class="feedback-group tier-${order[tier]}"><h3><span class="tier-dot"></span>${tier}</h3>${simpleMarkdownToHtml(m[2].trim())}</div>`;
  }
  if (!matched) {
    html = `<div class="feedback-group">${simpleMarkdownToHtml(text)}</div>`;
  }
  return html;
}

let lastAiResultText = "";

async function handleAiReview() {
  const text = document.getElementById("manuscriptInput").value.trim();
  const apiKey = document.getElementById("apiKeyInput").value.trim();
  const status = document.getElementById("aiStatus");
  const btn = document.getElementById("aiReviewBtn");

  if (!text) { status.textContent = "Paste or upload manuscript text first."; return; }
  const subtype = getSelectedSubtype();
  if (!subtype) {
    showTypeError("Please select what kind of research this is first — it determines which reporting guideline gets checked.");
    document.getElementById("researchTypeSelect").scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }
  clearTypeError();
  if (!apiKey) { status.textContent = "Enter your Anthropic API key first."; return; }

  if (document.getElementById("rememberKey").checked) {
    localStorage.setItem("manuscriptReviewApiKey", apiKey);
  } else {
    localStorage.removeItem("manuscriptReviewApiKey");
  }

  btn.disabled = true;
  status.textContent = "Reviewing... this can take 10–30 seconds.";

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 4096,
        system: buildAiSystemPrompt(subtype),
        messages: [{ role: "user", content: text }],
      }),
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody?.error?.message || `Request failed (${res.status})`);
    }

    const data = await res.json();
    const responseText = (data.content || []).map((b) => b.text || "").join("\n");
    lastAiResultText = responseText;

    document.getElementById("aiOutput").innerHTML = renderAiResponse(responseText);
    document.getElementById("aiResultsPanel").hidden = false;
    document.getElementById("aiResultsPanel").scrollIntoView({ behavior: "smooth", block: "start" });
    status.textContent = "";
  } catch (err) {
    status.textContent = `Error: ${err.message}`;
  } finally {
    btn.disabled = false;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("researchTypeSelect").addEventListener("change", (e) => {
    populateSubtypeSelect(e.target.value);
    clearTypeError();
  });

  document.getElementById("researchSubtypeSelect").addEventListener("change", clearTypeError);

  document.getElementById("reviewBtn").addEventListener("click", handleReview);

  document.getElementById("clearBtn").addEventListener("click", () => {
    document.getElementById("manuscriptInput").value = "";
    document.getElementById("resultsPanel").hidden = true;
  });

  document.getElementById("exampleBtn").addEventListener("click", () => {
    document.getElementById("manuscriptInput").value = EXAMPLE_MANUSCRIPT;
    setSelectedSubtype("original", "rct");
    handleReview();
  });

  document.getElementById("fileInput").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (file) handleFileInput(file);
  });

  document.getElementById("copyBtn").addEventListener("click", () => {
    if (!lastResultText) return;
    navigator.clipboard.writeText(lastResultText).then(() => {
      const btn = document.getElementById("copyBtn");
      const original = btn.textContent;
      btn.textContent = "Copied!";
      setTimeout(() => (btn.textContent = original), 1500);
    });
  });

  const savedKey = localStorage.getItem("manuscriptReviewApiKey");
  if (savedKey) {
    document.getElementById("apiKeyInput").value = savedKey;
    document.getElementById("rememberKey").checked = true;
  }

  document.getElementById("aiReviewBtn").addEventListener("click", handleAiReview);

  document.getElementById("forgetKeyBtn").addEventListener("click", () => {
    localStorage.removeItem("manuscriptReviewApiKey");
    document.getElementById("apiKeyInput").value = "";
    document.getElementById("rememberKey").checked = false;
    document.getElementById("aiStatus").textContent = "Saved key forgotten.";
  });

  document.getElementById("copyAiBtn").addEventListener("click", () => {
    if (!lastAiResultText) return;
    navigator.clipboard.writeText(lastAiResultText).then(() => {
      const btn = document.getElementById("copyAiBtn");
      const original = btn.textContent;
      btn.textContent = "Copied!";
      setTimeout(() => (btn.textContent = original), 1500);
    });
  });
});
