import { login } from "../auth.js";

export function renderLogin({ renderApp }) {
    const app = document.getElementById("app");

    app.innerHTML = `
        <form id="login-form">
            <input type="email" id="email" placeholder="Email" required>
            <input type="password" id="password" placeholder="Password" required>
            <button type="submit">Login</button>
        </form>

        <p id="message"></p>
    `;

    const loginForm = document.getElementById("login-form");

    loginForm.addEventListener("submit", async function(event) {
        event.preventDefault();

        const email = document.getElementById("email").value;
        const password = document.getElementById("password").value;
        const message = document.getElementById("message");

        const result = await login(email, password);

        if (result.ok) {
            renderApp(result.data);
        } else {
            message.textContent = result.data.error;
        }
    });
}
