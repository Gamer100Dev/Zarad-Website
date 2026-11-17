(() => {
  const storageKey = "zarad-theme";
  const root = document.documentElement;

  function readTheme() {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved === "light" || saved === "dark") return saved;
    } catch {}
    return "light";
  }

  function updateFavicon(dark) {
    let icon = document.querySelector('link[rel~="icon"]');
    if (!icon) {
      icon = document.createElement("link");
      icon.rel = "icon";
      document.head.appendChild(icon);
    }

    const background = dark ? "#302728" : "#f4ead9";
    const logo = new URL("/assets/Zarad-logo-main.png", window.location.href).href;
    const imageFilter = dark
      ? ' style="filter:url(#remove-white) invert(1)"'
      : ' filter="url(#remove-white)"';
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
      <rect width="64" height="64" rx="12" fill="${background}"/>
      <defs>
        <filter id="remove-white" color-interpolation-filters="sRGB">
          <feColorMatrix type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  -.333 -.333 -.333 0 1"/>
        </filter>
      </defs>
      <image href="${logo}" x="3" y="3" width="58" height="58" preserveAspectRatio="xMidYMid meet" filter="url(#remove-white)"${imageFilter}/>
    </svg>`;
    icon.type = "image/svg+xml";
    icon.href = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  }

  function applyTheme(theme, persist = false) {
    root.dataset.theme = theme;
    root.style.colorScheme = theme;
    const dark = theme === "dark";
    const button = document.getElementById("zarad_theme_toggle");
    if (button) {
      button.setAttribute("aria-label", dark ? "Switch to light mode" : "Switch to dark mode");
      button.title = dark ? "Light mode" : "Dark mode";
      button.setAttribute("aria-pressed", String(dark));
    }
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = dark ? "#211b1b" : "#f4ead9";
    updateFavicon(dark);
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