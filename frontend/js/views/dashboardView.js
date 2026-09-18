import { logout } from "../auth.js";
import { getWorkspaces, createWorkspace, getWorkspaceById } from "../workspaces.js";

export async function renderDashboard(user, { renderApp, renderWorkspace, renderLogin }) {
    const app = document.getElementById("app");

    app.innerHTML = `
        <h1>Bienvenue ${user.username}</h1>
        <p>${user.email}</p>

        <button id="logout-button">Logout</button>

        <div id="workspace-list"></div>
    `;

    const workspaceResult = await getWorkspaces();
    const workspaceList = document.getElementById("workspace-list");

    if (workspaceResult.ok) {
        const workspaces = workspaceResult.data;

        if (workspaces.length === 0) {
            workspaceList.innerHTML = `
                <p>Aucun workspace pour le moment.</p>
                <button id="create-workspace-button">Créer un workspace</button>
            `;

            const createWorkspaceButton = document.getElementById("create-workspace-button");

            createWorkspaceButton.addEventListener("click", async function() {
                const name = prompt("Nom du workspace :");

                if (!name) {
                    return;
                }

                const result = await createWorkspace(name);

                if (result.ok) {
                    renderApp(user);
                }
            });
        } else {
            workspaceList.innerHTML = "";

            workspaces.forEach(function(workspace) {
                const workspaceElement = document.createElement("button");

                workspaceElement.textContent = workspace.name;

                workspaceElement.addEventListener("click", async function() {
                    const result = await getWorkspaceById(workspace.id);

                    if (result.ok) {
                        renderWorkspace(result.data);
                    }
                });

                workspaceList.appendChild(workspaceElement);
            });
        }
    }

    console.log(workspaceResult);

    const logoutButton = document.getElementById("logout-button");

    logoutButton.addEventListener("click", async function() {
        const result = await logout();

        if (result.ok) {
            renderLogin();
        }
    });
}
