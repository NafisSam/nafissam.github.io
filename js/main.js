// Mobile nav toggle
const navToggle = document.getElementById("navToggle");
const navLinks = document.getElementById("navLinks");

if (navToggle && navLinks) {
  navToggle.addEventListener("click", () => {
    const isOpen = navLinks.classList.toggle("open");
    navToggle.setAttribute("aria-expanded", String(isOpen));
  });

  navLinks.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => {
      navLinks.classList.remove("open");
      navToggle.setAttribute("aria-expanded", "false");
    });
  });
}

// Footer year
const yearEl = document.getElementById("year");
if (yearEl) yearEl.textContent = new Date().getFullYear();

// Theme toggle (light/dark). Defaults to system preference; explicit choice
// persists in localStorage and overrides it via the html[data-theme] attribute.
const themeToggle = document.getElementById("themeToggle");

function currentTheme() {
  const stored = localStorage.getItem("theme");
  if (stored === "dark" || stored === "light") return stored;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyThemeIcon() {
  if (!themeToggle) return;
  const icon = themeToggle.querySelector(".theme-icon");
  // Icon shows what you'd switch TO.
  icon.textContent = currentTheme() === "dark" ? "☀️" : "🌙";
}

if (themeToggle) {
  applyThemeIcon();
  themeToggle.addEventListener("click", () => {
    const next = currentTheme() === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("theme", next);
    applyThemeIcon();
  });
}

// Reveal-on-scroll
const revealObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("in-view");
        revealObserver.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.15 }
);

const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function observeReveals() {
  if (prefersReducedMotion) return; // leave elements in their default, fully-visible state
  document.querySelectorAll(".reveal:not(.pending):not(.in-view)").forEach((el) => {
    el.classList.add("pending");
    revealObserver.observe(el);
  });
}

document.addEventListener("DOMContentLoaded", () => {
  observeReveals();
  // project cards are injected after DOMContentLoaded by projects-data.js;
  // give the browser a tick to paint them before observing.
  setTimeout(observeReveals, 0);
});
