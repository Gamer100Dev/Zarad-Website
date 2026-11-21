const languageButton = document.querySelector("#zarad_language");
const currentYear = document.querySelector("#current-year");
const catalogGrid = document.querySelector("#zarad_catalog");
const catalogStatus = document.querySelector("#zarad_catalog_status");
const slider = document.querySelector("#zarad_slider");

let currentLanguage = "ro";

if (currentYear) {
  currentYear.textContent = new Date().getFullYear();
}

function setLanguage(language) {
  currentLanguage = language;
  document.documentElement.lang = language;

  document.querySelectorAll("[data-ro][data-en]").forEach((element) => {
    element.textContent = element.dataset[language];
  });

  document.querySelectorAll("[data-alt-ro][data-alt-en]").forEach((image) => {
    image.alt = language === "ro" ? image.dataset.altRo : image.dataset.altEn;
  });

  if (languageButton) {
    const isEnglish = language === "en";
    languageButton.classList.toggle("is-en", isEnglish);
    languageButton.classList.toggle("is-ro", !isEnglish);
    languageButton.setAttribute(
      "aria-label",
      isEnglish ? "Schimbă limba în română" : "Switch to English"
    );
    languageButton.title = isEnglish ? "Română" : "English";
  }

  try {
    localStorage.setItem("zarad-language", language);
  } catch {
  }

  renderCatalog();
}

function renderCatalog() {
  if (!catalogGrid || !Array.isArray(window.zaradCatalog)) {
    return;
  }

  catalogGrid.replaceChildren();

  window.zaradCatalog.forEach((spice, index) => {
    const card = document.createElement("article");
    card.className = "catalog-card";

    const imageFrame = document.createElement("div");
    imageFrame.className = "catalog-card-image";

    const image = document.createElement("img");
    image.src = "/assets/" + spice.folder + "/" + spice.image;
    image.alt = currentLanguage === "ro" ? spice.name : spice.name_en;
    image.loading = "lazy";
    image.decoding = "async";
    imageFrame.append(image);

    const details = document.createElement("div");
    details.className = "catalog-card-details";

    const number = document.createElement("span");
    number.className = "catalog-card-number";
    number.textContent = String(index + 1).padStart(2, "0");

    const heading = document.createElement("h2");
    heading.textContent = currentLanguage === "ro" ? spice.name : spice.name_en;

    const description = document.createElement("p");
    description.textContent = currentLanguage === "ro" ? spice.description : spice.description_en;

    details.append(number, heading, description);
    card.append(imageFrame, details);
    catalogGrid.append(card);
  });
}

async function loadCatalog() {
  if (!catalogGrid) {
    return;
  }

  try {
    const response = await fetch("/catalog.json", { cache: "no-cache" });
    if (!response.ok) {
      throw new Error("Catalogul nu a putut fi încărcat");
    }

    window.zaradCatalog = await response.json();
    renderCatalog();
  } catch {
    if (catalogStatus) {
      catalogStatus.hidden = false;
    }
  }
}

function setupSlider() {
  if (!slider) {
    return;
  }

  const slides = Array.from(slider.querySelectorAll(".hero-slide"));
  if (slides.length < 2) return;
  const dots = Array.from(slider.querySelectorAll(".slider-dot"));
  const previous = slider.querySelector("#zarad_previous");
  const next = slider.querySelector("#zarad_next");
  let activeSlide = 0;
  let timer;
  let startX = 0;

  function showSlide(index) {
    activeSlide = (index + slides.length) % slides.length;

    slides.forEach((slide, slideIndex) => {
      const active = slideIndex === activeSlide;
      slide.classList.toggle("is-active", active);
      slide.setAttribute("aria-hidden", String(!active));

      const image = slide.querySelector("img");
      if (active && image.dataset.src && !image.hasAttribute("src")) {
        image.src = image.dataset.src;
      }
    });

    dots.forEach((dot, dotIndex) => {
      const active = dotIndex === activeSlide;
      dot.classList.toggle("is-active", active);
      if (active) {
        dot.setAttribute("aria-current", "true");
      } else {
        dot.removeAttribute("aria-current");
      }
    });
  }

  function restartTimer() {
    window.clearInterval(timer);
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      timer = window.setInterval(() => showSlide(activeSlide + 1), 6500);
    }
  }

  previous.addEventListener("click", () => {
    showSlide(activeSlide - 1);
    restartTimer();
  });

  next.addEventListener("click", () => {
    showSlide(activeSlide + 1);
    restartTimer();
  });

  dots.forEach((dot, index) => {
    dot.addEventListener("click", () => {
      showSlide(index);
      restartTimer();
    });
  });

  slider.addEventListener("mouseenter", () => window.clearInterval(timer));
  slider.addEventListener("mouseleave", restartTimer);

  slider.addEventListener("touchstart", (event) => {
    startX = event.changedTouches[0].clientX;
  }, { passive: true });

  slider.addEventListener("touchend", (event) => {
    const distance = event.changedTouches[0].clientX - startX;
    if (Math.abs(distance) > 45) {
      showSlide(activeSlide + (distance < 0 ? 1 : -1));
      restartTimer();
    }
  }, { passive: true });

  showSlide(0);
  restartTimer();
}


function setupHomeReveal() {
  const root = document.documentElement;
  if (!root.classList.contains("home-reveal-enabled")) return;

  const items = document.querySelectorAll("[data-home-reveal]");
  if (!items.length) return;

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      entry.target.classList.toggle("is-visible", entry.isIntersecting);
    });
  }, {
    threshold: 0.12,
    rootMargin: "0px 0px -5% 0px"
  });

  items.forEach((item) => observer.observe(item));
}

function setupSecretSpiceGame() {
  const trigger = document.querySelector("#spice-game-trigger");
  const overlay = document.querySelector("#spice-game");
  if (!trigger || !overlay) return;

  const dialog = overlay.querySelector(".spice-game-dialog");
  const closeButton = document.querySelector("#spice-game-close");
  const intro = document.querySelector("#spice-game-intro");
  const playPanel = document.querySelector("#spice-game-play");
  const resultPanel = document.querySelector("#spice-game-result");
  const startButton = document.querySelector("#spice-game-start");
  const restartButton = document.querySelector("#spice-game-restart");
  const optionsContainer = document.querySelector("#spice-game-options");
  const clueText = document.querySelector("#spice-game-clue-text");
  const feedback = document.querySelector("#spice-game-feedback");
  const scoreDisplay = document.querySelector("#spice-game-score");
  const timeDisplay = document.querySelector("#spice-game-time");
  const roundDisplay = document.querySelector("#spice-game-round");
  const resultTitle = document.querySelector("#spice-game-result-title");
  const resultCopy = document.querySelector("#spice-game-result-copy");
  const resultMark = document.querySelector("#spice-game-result-mark");

  const spices = [
    {
      id: "turmeric",
      icon: "🟡",
      ro: "Curcuma",
      en: "Turmeric",
      clueRo: "Sunt aurie și dau culoare multor curry-uri și amestecuri de condimente.",
      clueEn: "I am golden-yellow and bring colour to many curries and spice blends."
    },
    {
      id: "cumin",
      icon: "🌿",
      ro: "Chimion",
      en: "Cumin",
      clueRo: "Am o aromă caldă, pământie și sunt des întâlnit în bucătăria marocană.",
      clueEn: "I have a warm, earthy flavour and appear often in Moroccan cooking."
    },
    {
      id: "paprika",
      icon: "🌶️",
      ro: "Boia",
      en: "Paprika",
      clueRo: "Sunt făcută din ardei uscați și pot fi dulce sau afumată.",
      clueEn: "I am made from dried peppers and can be sweet or smoky."
    },
    {
      id: "cinnamon",
      icon: "🪵",
      ro: "Scorțișoară",
      en: "Cinnamon",
      clueRo: "Sunt caldă și dulce, iar aroma mea se potrivește și deserturilor, și unor preparate sărate.",
      clueEn: "I am warm and sweet, and my flavour suits desserts as well as some savoury dishes."
    },
    {
      id: "ginger",
      icon: "🫚",
      ro: "Ghimbir",
      en: "Ginger",
      clueRo: "Am o notă proaspătă și ușor iute. Sunt folosită atât rasă, cât și uscată.",
      clueEn: "I have a fresh, gently fiery note. I can be used fresh or dried."
    },
    {
      id: "saffron",
      icon: "🌺",
      ro: "Șofran",
      en: "Saffron",
      clueRo: "Sunt alcătuit din fire roșii delicate și sunt una dintre cele mai prețioase mirodenii.",
      clueEn: "I am made of delicate red threads and am one of the world's most precious spices."
    }
  ];

  let gameTimer = null;
  let nextRoundTimer = null;
  let remainingSeconds = 40;
  let score = 0;
  let round = 0;
  let targets = [];
  let playing = false;
  let previousFocus = null;

  function languageText(ro, en) {
    return currentLanguage === "ro" ? ro : en;
  }

  function shuffle(items) {
    const copy = items.slice();
    for (let index = copy.length - 1; index > 0; index -= 1) {
      const randomIndex = Math.floor(Math.random() * (index + 1));
      [copy[index], copy[randomIndex]] = [copy[randomIndex], copy[index]];
    }
    return copy;
  }

  function updateStats() {
    scoreDisplay.textContent = score + " / 5";
    timeDisplay.textContent = remainingSeconds + "s";
    roundDisplay.textContent = Math.min(round + 1, 5) + " / 5";
    timeDisplay.classList.toggle("is-urgent", remainingSeconds <= 10);
  }

  function clearGameTimers() {
    window.clearInterval(gameTimer);
    window.clearTimeout(nextRoundTimer);
    gameTimer = null;
    nextRoundTimer = null;
  }

  function renderRound() {
    const target = targets[round];
    if (!target) {
      finishGame(true);
      return;
    }

    clueText.textContent = currentLanguage === "ro" ? target.clueRo : target.clueEn;
    feedback.textContent = "";
    optionsContainer.replaceChildren();

    shuffle(spices).forEach((spice) => {
      const option = document.createElement("button");
      option.type = "button";
      option.className = "spice-game-option";
      option.dataset.spice = spice.id;
      option.innerHTML = '<span class="spice-game-option-icon" aria-hidden="true"></span><span class="spice-game-option-name"></span>';
      option.querySelector(".spice-game-option-icon").textContent = spice.icon;
      option.querySelector(".spice-game-option-name").textContent =
        currentLanguage === "ro" ? spice.ro : spice.en;
      option.addEventListener("click", () => selectSpice(option, spice, target));
      optionsContainer.append(option);
    });

    updateStats();
  }

  function selectSpice(option, spice, target) {
    if (!playing || option.disabled) return;

    if (spice.id === target.id) {
      option.classList.add("is-correct");
      optionsContainer.querySelectorAll("button").forEach((button) => {
        button.disabled = true;
      });
      score += 1;
      updateStats();
      feedback.textContent = languageText("Exact! Ai găsit " + target.ro + ".", "That's it! You found " + target.en + ".");
      nextRoundTimer = window.setTimeout(() => {
        round += 1;
        if (round >= 5) {
          finishGame(true);
        } else {
          renderRound();
        }
      }, 650);
      return;
    }

    option.disabled = true;
    option.classList.add("is-wrong");
    remainingSeconds = Math.max(0, remainingSeconds - 3);
    updateStats();
    feedback.textContent = languageText("Nu chiar — mai încearcă. Ai pierdut 3 secunde.", "Not quite — try another jar. You lost 3 seconds.");
    if (remainingSeconds <= 0) finishGame(false);
  }

  function finishGame(won) {
    if (!playing) return;
    playing = false;
    clearGameTimers();
    playPanel.hidden = true;
    resultPanel.hidden = false;

    if (won) {
      resultTitle.textContent = languageText("Ai găsit toate aromele!", "You found the whole blend!");
      resultCopy.textContent = languageText(
        "5 din 5 — ai un instinct grozav pentru condimente. Zarad te așteaptă pentru următoarea descoperire.",
        "5 out of 5 — you have a brilliant instinct for spices. Zarad has more flavours waiting to be discovered."
      );
      resultMark.textContent = "✦";
    } else {
      resultTitle.textContent = languageText("Timpul s-a scurs!", "Time's up!");
      resultCopy.textContent = languageText(
        "Ai găsit " + score + " din 5 condimente. Mai încearcă și vezi dacă poți descoperi tot amestecul.",
        "You found " + score + " out of 5 spices. Have another go and see if you can find the whole blend."
      );
      resultMark.textContent = "⏳";
    }
    restartButton.focus();
  }

  function startGame() {
    clearGameTimers();
    score = 0;
    round = 0;
    remainingSeconds = 40;
    targets = shuffle(spices).slice(0, 5);
    playing = true;
    intro.hidden = true;
    resultPanel.hidden = true;
    playPanel.hidden = false;
    renderRound();
    gameTimer = window.setInterval(() => {
      remainingSeconds = Math.max(0, remainingSeconds - 1);
      updateStats();
      if (remainingSeconds <= 0) finishGame(false);
    }, 1000);
    const firstOption = optionsContainer.querySelector("button");
    if (firstOption) firstOption.focus();
  }

  function openGame() {
    previousFocus = document.activeElement;
    clearGameTimers();
    playing = false;
    intro.hidden = false;
    playPanel.hidden = true;
    resultPanel.hidden = true;
    overlay.hidden = false;
    document.body.classList.add("spice-game-open");
    closeButton.focus();
  }

  function closeGame() {
    clearGameTimers();
    playing = false;
    overlay.hidden = true;
    document.body.classList.remove("spice-game-open");
    if (previousFocus && typeof previousFocus.focus === "function") {
      previousFocus.focus();
    }
  }

  // A normal click (or keyboard activation) opens the hidden game immediately.
  trigger.addEventListener("click", openGame);

  closeButton.addEventListener("click", closeGame);
  startButton.addEventListener("click", startGame);
  restartButton.addEventListener("click", startGame);

  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) closeGame();
  });

  document.addEventListener("keydown", (event) => {
    if (overlay.hidden) return;
    if (event.key === "Escape") {
      event.preventDefault();
      closeGame();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = Array.from(dialog.querySelectorAll("button:not([disabled])"))
      .filter((element) => !element.closest("[hidden]"));
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
}

let savedLanguage = "ro";

try {
  savedLanguage = localStorage.getItem("zarad-language") === "en" ? "en" : "ro";
} catch {
  savedLanguage = "ro";
}

setLanguage(savedLanguage);
loadCatalog();
setupSlider();
setupHomeReveal();
setupSecretSpiceGame();

if (languageButton) {
  languageButton.addEventListener("click", () => {
    setLanguage(currentLanguage === "ro" ? "en" : "ro");
  });
}
