import { login } from "../auth.js";

export function renderLogin({ renderApp }, initialError = "") {
    const app = document.getElementById("app");
    app.removeAttribute("aria-busy");
    app.innerHTML = `
        <main id="page-content" class="login-page">
            <form id="login-form" class="login-form">
                <div class="login-heading">
                    <div class="login-brand">
                        <img class="icon icon-mark" src="./assets/icons/mark.svg" alt="" width="32" height="32">
                        <span>TaskFlow</span>
                    </div>
                    <h1>Sign in</h1>
                    <p class="secondary-text">Welcome back. Open your workspaces and pick up where you left off.</p>
                </div>
                <div class="login-fields">
                    <div class="field">
                        <label for="email">Email</label>
                        <input type="email" id="email" name="email" autocomplete="username" maxlength="255" required>
                    </div>
                    <div class="field">
                        <label for="password">Password</label>
                        <input type="password" id="password" name="password" autocomplete="current-password" required>
                    </div>
                    <p id="message" class="form-message login-message" role="alert" aria-live="polite" hidden></p>
                </div>
                <button type="submit" class="btn-primary">Sign in</button>
            </form>
        </main>`;
    const form = app.querySelector("#login-form");
    const message = app.querySelector("#message");
    const submit = form.querySelector('button[type="submit"]');
    setMessage(message, initialError);

    form.addEventListener("submit", event => {
        event.preventDefault();
        if (submit.disabled) return;
        withBusy(submit, async () => {
            setMessage(message);
            const result = await login(form.elements.email.value.trim(), form.elements.password.value);
            if (!form.isConnected) return;
            if (result.ok) await renderApp(result.data);
            else setMessage(message, result.status === 401
                ? "Invalid email or password. Please try again." : result.data.error);
        });
    });
}

function setMessage(element, text = "", type = "error") {
    if (!element) return;
    element.textContent = text;
    element.hidden = !text;
    element.dataset.type = type;
    element.setAttribute("role", type === "error" ? "alert" : "status");
}

async function withBusy(control, action) {
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
