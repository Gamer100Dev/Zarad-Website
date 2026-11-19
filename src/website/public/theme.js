(() => {
  const storageKey = "zarad-theme";
  const root = document.documentElement;

  const lightLogo = "/assets/Zarad_logo_for_white.png?v=zarad-logo-light-matched-20261119";
  const darkLogo = "/assets/Zarad_logo_for_dark.png?v=zarad-logo-dark-matched-20261119";

  function readTheme() {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved === "light" || saved === "dark") return saved;
    } catch {}
    return "light";
  }

  function updateBranding(dark) {
    const logo = dark ? darkLogo : lightLogo;

    document.querySelectorAll("#zarad_logo, .footer-brand img").forEach(image => {
      if (image.getAttribute("src") !== logo) {
        image.setAttribute("src", logo);
      }
    });

    const favicon = document.querySelector('link[rel~="icon"]');
    if (favicon) {
      const icon = dark
        ? "/assets/Zarad_logo_for_dark.png?v=zarad-dark-favicon-matched-20261119"
        : "/assets/Zarad_logo_for_white.png?v=zarad-light-favicon-matched-20261119";
      if (favicon.getAttribute("href") !== icon) {
        favicon.setAttribute("href", icon);
      }
    }
  }

  function applyTheme(theme, persist = false) {
    root.dataset.theme = theme;
    root.style.colorScheme = theme;
    const dark = theme === "dark";
    updateBranding(dark);

    const button = document.getElementById("zarad_theme_toggle");
    if (button) {
      button.setAttribute("aria-label", dark ? "Switch to light mode" : "Switch to dark mode");
      button.title = dark ? "Light mode" : "Dark mode";
      button.setAttribute("aria-pressed", String(dark));
    }
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = dark ? "#211b1b" : "#f4ead9";
    if (persist) {
      try { localStorage.setItem(storageKey, theme); } catch {}
    }
  }

  function addToggle() {
    const right = document.querySelector(".zarad-right");
    if (!right || document.getElementById("zarad_theme_toggle")) return;
    const button = document.createElement("button");
    button.type = "button";
    button.id = "zarad_theme_toggle";
    button.className = "zarad-theme-toggle";
    button.innerHTML = '<svg class="theme-moon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20.2 15.1A8.5 8.5 0 0 1 8.9 3.8 8.6 8.6 0 1 0 20.2 15.1Z"/></svg><svg class="theme-sun" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"/></svg>';
    button.addEventListener("click", () => {
      applyTheme(root.dataset.theme === "dark" ? "light" : "dark", true);
    });
    right.appendChild(button);
    applyTheme(root.dataset.theme || readTheme());
  }

  applyTheme(readTheme());
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", addToggle, { once: true });
  } else {
    addToggle();
  }
})();