const statusDot = document.querySelector(".status-dot");
const zaradWindow = document.querySelector("#zarad-window");
const zaradName = document.querySelector("#zarad-name");
const zaradSend = document.querySelector("#zarad-send");
const zaradReply = document.querySelector("#zarad-reply");
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

async function sendZaradMessage() {
  zaradSend.disabled = true;
  zaradReply.textContent = "Sending your message…";

  try {
    const url = "/api/zarad/window?name=" + encodeURIComponent(zaradName.value.trim());
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error("The request could not be completed");
    }

    const data = await response.json();
    zaradReply.textContent = data.reply;
  } catch {
    zaradReply.textContent = "Zarad could not reach the server. Try again.";
  } finally {
    zaradSend.disabled = false;
  }
}

zaradSend.addEventListener("click", sendZaradMessage);

zaradWindow.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && event.target === zaradName) {
    event.preventDefault();
    sendZaradMessage();
  }
});
