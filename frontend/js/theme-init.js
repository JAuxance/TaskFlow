// Apply the saved theme before loading CSS, without an inline script.
(() => {
    let preference = "system";
    try {
        const saved = localStorage.getItem("taskflow-theme");
        if (["light", "dark"].includes(saved)) preference = saved;
    } catch {}
    document.documentElement.dataset.themePreference = preference;
    document.documentElement.dataset.theme = preference === "dark" ||
        (preference === "system" && matchMedia("(prefers-color-scheme: dark)").matches) ?
        "dark" : "light";
})();
