export function escapeHTML(value = "") {
    return String(value ?? "").replace(/[&<>"']/g, character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    }[character]));
}


export function setMessage(element, text = "", type = "error") {
    if (!element) return;
    element.textContent = text;
    element.hidden = !text;
    element.dataset.type = type;
    element.setAttribute("role", type === "error" ? "alert" : "status");
}

export async function withBusy(control, action) {
    const wasDisabled = control.disabled;
    control.disabled = true;
    control.setAttribute("aria-busy", "true");
    try {
        return await action();
    } finally {
        control.disabled = wasDisabled;
        control.removeAttribute("aria-busy");
    }
}
