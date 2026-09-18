import { getCurrentUser, logout } from "./auth.js";
import { getWorkspaces, getWorkspacesMembers, getWorkspaceById } from "./workspaces.js";
import { renderLogin as renderLoginView } from "./views/loginView.js";
import { renderDashboard } from "./views/dashboardView.js";
import { renderWorkspace as renderWorkspaceView } from "./views/workspaceView.js";
import { renderProject as renderProjectView } from "./views/projectView.js";
import { renderTask as renderTaskView } from "./views/taskView.js";

let viewVersion = 0;
const navigation = { renderLogin, renderApp, renderWorkspace, renderProject, renderTask };

async function showView(render, layout) {
    const version = ++viewVersion;
    const context = { ...navigation, isCurrent: () => version === viewVersion };
    if (layout) {
        const page = await renderLayout({ ...layout, navigation: context });
        if (!page) return;
        Object.assign(context, page);
    }
    await render(context);
    if (!context.isCurrent()) return;
    const heading = document.querySelector("#app h1");
    if (heading) {
        heading.id = "page-title";
        heading.tabIndex = -1;
        document.title = heading.textContent === "TaskFlow" ? "TaskFlow — Sign in" : `${heading.textContent} — TaskFlow`;
        document.getElementById("page-content")?.setAttribute("aria-labelledby", heading.id);
        heading.focus({ preventScroll: true });
    }
    window.scrollTo(0, 0);
}

function renderLogin(error = "") {
    return showView(context => renderLoginView(context, error));
}

function renderApp(user) {
    return showView(context => renderDashboard(user, context), { user, pageClass: "dashboard-page" });
}

function renderWorkspace(workspace) {
    return showView(context => renderWorkspaceView(workspace, context), {
        workspace, pageClass: "workspace-page",
        breadcrumbs: [{ label: "Workspaces", action: () => renderApp() }, { label: workspace.name }]
    });
}

function renderProject(project, workspace) {
    return showView(context => renderProjectView(project, workspace, context), {
        workspace, pageClass: "project-page",
        breadcrumbs: [
            { label: "Workspaces", action: () => renderApp() },
            { label: workspace.name, action: () => renderWorkspace(workspace) },
            { label: project.name }
        ]
    });
}

function renderTask(task, project, workspace) {
    return showView(context => renderTaskView(task, project, workspace, context), {
        workspace, pageClass: "task-page",
        breadcrumbs: [
            { label: "Workspaces", action: () => renderApp() },
            { label: workspace.name, action: () => renderWorkspace(workspace) },
            { label: project.name, action: () => renderProject(project, workspace) },
            { label: "Task details" }
        ]
    });
}

async function initApp() {
    const result = await getCurrentUser();
    if (result.ok) await renderApp(result.data);
    else await renderLogin(result.status === 401 ? "" : result.data.error);
}

async function renderLayout({ navigation, user, workspace = null,
    breadcrumbs = [{ label: "Workspace" }], pageClass = "" }) {
    const app = document.getElementById("app");
    app.setAttribute("aria-busy", "true");
    const [userResult, workspaceResult, membersResult] = await Promise.all([
        user ? Promise.resolve({ ok: true, data: user }) : getCurrentUser(),
        getWorkspaces(),
        workspace ? getWorkspacesMembers(workspace.id) : Promise.resolve({ ok: true, data: [] })
    ]);
    if (navigation.isCurrent && !navigation.isCurrent()) return null;
    app.removeAttribute("aria-busy");
    if (!userResult.ok) {
        navigation.renderLogin(userResult.status === 401 ? "" : userResult.data.error);
        return null;
    }
    if (workspaceResult.status === 401 || membersResult.status === 401) {
        navigation.renderLogin();
        return null;
    }

    user = userResult.data;
    const workspaces = workspaceResult.ok ? workspaceResult.data : [];
    const members = membersResult.ok ? membersResult.data : null;
    const isOwner = Boolean(workspace && Number(workspace.owner_id) === Number(user.id));
    const role = isOwner ? "owner" : members?.find(member =>
        Number(member.user_id) === Number(user.id))?.role ?? null;

    app.innerHTML = `
        <div class="app-layout">
            <aside class="sidebar" aria-label="Workspace navigation">
                <div class="sidebar-header"><img class="icon icon-mark" src="./assets/icons/mark.svg" width="24" height="24" alt="" aria-hidden="true"><span>TaskFlow</span></div>
                <nav class="sidebar-navigation" aria-label="Workspaces">
                    <button type="button" id="all-workspaces-button" class="workspace-button ${workspace ? "" : "is-active"}"
                        ${workspace ? "" : 'aria-current="page"'}><img class="icon icon-workspace" src="./assets/icons/workspace.svg" width="18" height="18" alt="" aria-hidden="true"><span>All workspaces</span></button>
                    <p class="sidebar-label">Workspaces</p>
                    <div id="workspace-list"></div>
                    <p id="sidebar-message" class="form-message" role="alert" hidden></p>
                </nav>
                <div class="sidebar-account">
                    <span class="account-name">${escapeHTML(user.username || user.email)}</span>
                    <span class="account-email">${escapeHTML(user.email)}</span>
                    <button type="button" id="logout-button" class="btn-quiet">Sign out</button>
                </div>
            </aside>
            <main class="main-content">
                <header class="main-header"><nav class="breadcrumbs" aria-label="Breadcrumb"></nav></header>
                <section id="page-content" class="page-content ${escapeHTML(pageClass)}" tabindex="-1"></section>
            </main>
        </div>`;

    const content = app.querySelector("#page-content");
    const sidebarMessage = app.querySelector("#sidebar-message");
    const workspaceList = app.querySelector("#workspace-list");
    const breadcrumbList = app.querySelector(".breadcrumbs");
    const current = () => content.isConnected && (!navigation.isCurrent || navigation.isCurrent());

    breadcrumbs.forEach((crumb, index) => {
        if (index) {
            const separator = document.createElement("span");
            separator.className = "breadcrumb-separator";
            separator.textContent = "/";
            separator.setAttribute("aria-hidden", "true");
            breadcrumbList.appendChild(separator);
        }
        const element = document.createElement(crumb.action ? "button" : "span");
        element.textContent = crumb.label;
        element.title = crumb.label;
        if (crumb.action) {
            element.type = "button";
            element.className = "breadcrumb-link";
            element.addEventListener("click", crumb.action);
        } else element.setAttribute("aria-current", "page");
        breadcrumbList.appendChild(element);
    });

    app.querySelector("#all-workspaces-button").addEventListener("click", () => navigation.renderApp(user));
    for (const item of workspaces) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "workspace-button";
        button.innerHTML = `<img class="icon icon-workspace" src="./assets/icons/workspace.svg" width="18" height="18" alt="" aria-hidden="true"><span>${escapeHTML(item.name)}</span>`;
        button.title = item.name;
        if (workspace && Number(item.id) === Number(workspace.id)) {
            button.classList.add("is-active");
            button.setAttribute("aria-current", "page");
        }
        button.addEventListener("click", () => withBusy(button, async () => {
            setMessage(sidebarMessage);
            const result = await getWorkspaceById(item.id);
            if (!current()) return;
            if (result.ok) navigation.renderWorkspace(result.data);
            else setMessage(sidebarMessage, result.data.error);
        }));
        workspaceList.appendChild(button);
    }
    if (!workspaceResult.ok) setMessage(sidebarMessage, workspaceResult.data.error);
    else if (!workspaces.length) {
        const empty = document.createElement("p");
        empty.className = "sidebar-empty";
        empty.textContent = "No workspaces yet.";
        workspaceList.appendChild(empty);
    }
    const logoutButton = app.querySelector("#logout-button");
    logoutButton.addEventListener("click", () => withBusy(logoutButton, async () => {
        const result = await logout();
        if (!current()) return;
        if (result.ok || result.status === 401) navigation.renderLogin();
        else setMessage(sidebarMessage, result.data.error);
    }));

    return { content, user, workspaces, members, role, isOwner,
        membersError: membersResult.ok ? "" : membersResult.data.error,
        workspacesError: workspaceResult.ok ? "" : workspaceResult.data.error };
}

function escapeHTML(value = "") {
    return String(value ?? "").replace(/[&<>"']/g, character => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[character]));
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

initApp();
