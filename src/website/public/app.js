const statusDot = document.querySelector(".status-dot");
const helloForm = document.querySelector("#hello-form");
const nameInput = document.querySelector("#name");
const reply = document.querySelector("#reply");
const year = document.querySelector("#year");

year.textContent = new Date().getFullYear();

fetch("/api/health")
  .then((response) => {
    if (!response.ok) {
      throw new Error("The API is unavailable");
    }
    return response.json();
  })
  .then((data) => {
    if (data.status === "ok") {
      statusDot.setAttribute("title", "Website is online");
    }
  })
  .catch(() => {
    statusDot.style.background = "#c47766";
    statusDot.setAttribute("title", "The API is unavailable");
  });

helloForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const name = nameInput.value.trim();
  const button = helloForm.querySelector("button");

  button.disabled = true;
  reply.textContent = "Getting a reply…";

  try {
    const response = await fetch(`/api/hello?name=${encodeURIComponent(name)}`);
    if (!response.ok) {
      throw new Error("The request could not be completed");
    }

    const data = await response.json();
    reply.textContent = data.message;
  } catch {
    reply.textContent = "Couldn't reach the server. Give it another try.";
  } finally {
    button.disabled = false;
  }
});
