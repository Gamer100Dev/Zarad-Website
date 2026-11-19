(() => {
  if (!("serviceWorker" in navigator)) {
    return;
  }

  let reloading = false;

  // A newly activated worker takes control, then one reload ensures this page
  // and its assets are requested through the freshness checks below.
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloading) {
      return;
    }

    reloading = true;
    window.location.reload();
  });

  window.addEventListener("load", async () => {
    try {
      const registration = await navigator.serviceWorker.register("/service-worker.js", {
        scope: "/",
        updateViaCache: "none"
      });

      // Ask the browser to check the worker script whenever a page is opened.
      await registration.update();
    } catch (error) {
      // Service workers require HTTPS (or localhost); the site still works
      // normally in browsers where registration is unavailable.
      console.warn("[Zarad] Automatic asset refresh is unavailable.", error);
    }
  }, { once: true });
})();
