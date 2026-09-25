import { setMessage, withBusy } from "../ui.js";
import { register } from "../auth.js";

export function renderRegister({ renderApp, renderLogin }) {
    const app = document.getElementById("app");

    app.removeAttribute("aria-busy");

    app.innerHTML = `
    <main id="page-content" class="login-page">
        <form id="register-form" class="login-form">

            <div class="login-heading">
                <div class="login-brand">
                    <img
                        class="icon icon-mark"
                        src="./assets/icons/mark.svg"
                        alt=""
                        width="32"  
                        height="32"
                    >
                    <span>TaskFlow</span>
                    </div>

                    <h1>Create account</h1>
                    <p class="secondary-text">
                        Create your TaskFlow account.
                    </p>
                </div>

                <div class="login-fields">
                    <div class="field">
                    <label for="username">Username</label>
                    <input type="text" id="username" name="username" autocomplete="username" maxlength="50" required>
                    </div>

                     <div class="field">
                     <label for="email">Email</label>
                     <input type="email" id="email" name="email" autocomplete="email" maxlength="255" required>
                     </div>

                     <div class="field">
                    <label for="password">Password</label>
                    <input type="password" id="password" name="password" autocomplete="new-password" minlength="8" required>
                    </div>
                    <p
                        id="message"
                        class="form-message login-message"
                        role="alert"
                        aria-live="polite"
                        hidden
                    ></p>
                    
                </div>

                <button type="submit" class="btn-primary">
                    Create account
                </button>

                <button type="button" id="login-button" class="btn-quiet">
                    Already have an account? Sign in
                </button>

            </form>
        </main>
    `;

    const form = app.querySelector("#register-form");
    const message = app.querySelector("#message");
    const submit = form.querySelector('button[type="submit"]');
    const loginButton = app.querySelector("#login-button");

    loginButton.addEventListener("click", function() {
        renderLogin();
    });
    form.addEventListener("submit", event => {
        event.preventDefault();

        if (submit.disabled) return;

        withBusy(submit, async () => {
            setMessage(message);
            const username = form.elements.username.value.trim();
            const email = form.elements.email.value.trim();
            const password = form.elements.password.value;
            const result = await register(username, email, password);

            if (!form.isConnected) return;
            if (result.ok) await renderApp(result.data);
            else setMessage(message, result.data.error);
        });
    });
}
