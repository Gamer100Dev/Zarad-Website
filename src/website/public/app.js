const languageButton = document.querySelector("#zarad_language");
const currentYear = document.querySelector("#current-year");

if (currentYear) {
  currentYear.textContent = new Date().getFullYear();
}

function setLanguage(language) {
  document.documentElement.lang = language;

  document.querySelectorAll("[data-ro][data-en]").forEach((element) => {
    element.textContent = element.dataset[language];
  });

  document.querySelectorAll("[data-alt-ro][data-alt-en]").forEach((image) => {
    image.alt = language === "ro" ? image.dataset.altRo : image.dataset.altEn;
  });

  if (languageButton) {
    languageButton.textContent = language === "ro" ? "EN" : "RO";
    languageButton.setAttribute(
      "aria-label",
      language === "ro" ? "Switch to English" : "Schimbă limba în română"
    );
    languageButton.title = language === "ro" ? "English" : "Română";
  }

  try {
    localStorage.setItem("zarad-language", language);
  } catch {
    return;
  }
}

let savedLanguage = "ro";

try {
  savedLanguage = localStorage.getItem("zarad-language") === "en" ? "en" : "ro";
} catch {
  savedLanguage = "ro";
}

setLanguage(savedLanguage);

if (languageButton) {
  languageButton.addEventListener("click", () => {
    setLanguage(document.documentElement.lang === "ro" ? "en" : "ro");
  });
}
