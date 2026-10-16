export async function prepareOfflineShell(): Promise<boolean> {
  if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator))
    return false;
  const registration = await navigator.serviceWorker.register("/sw.js", {
    scope: "/",
    updateViaCache: "none",
  });
  const worker = registration.installing ?? registration.waiting;
  if (worker && worker.state !== "activated")
    await new Promise<void>((resolve, reject) => {
      const changed = () => {
        if (worker.state === "activated") {
          worker.removeEventListener("statechange", changed);
          resolve();
        }
        if (worker.state === "redundant") {
          worker.removeEventListener("statechange", changed);
          reject(new Error("Não foi possível preparar o modo offline."));
        }
      };
      worker.addEventListener("statechange", changed);
      changed();
    });
  await navigator.serviceWorker.ready;
  return true;
}
