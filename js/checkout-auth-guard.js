window.ARVEL_CHECKOUT_AUTH_READY = (async function () {
  try {
    const [{ initializeApp, getApps }, { getAuth, onAuthStateChanged }, configModule] =
      await Promise.all([
        import("https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js"),
        import("https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js"),
        import("./firebase-config.js?v=20260731-5")
      ]);

    if (!configModule.firebaseConfigured) {
      location.replace("login.html?next=checkout.html");
      return false;
    }

    const app = getApps().find((candidate) => candidate.name === "[DEFAULT]")
      || initializeApp(configModule.firebaseConfig);
    const auth = getAuth(app);
    const user = await new Promise((resolve, reject) => {
      const unsubscribe = onAuthStateChanged(
        auth,
        (currentUser) => {
          unsubscribe();
          resolve(currentUser);
        },
        reject
      );
    });

    if (!user) {
      location.replace("login.html?next=checkout.html");
      return false;
    }

    document.querySelector("#contenido-principal")?.removeAttribute("hidden");
    return true;
  } catch (error) {
    console.error("No pudimos comprobar la sesión", error);
    location.replace("login.html?next=checkout.html");
    return false;
  }
})();
