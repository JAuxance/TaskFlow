import { getCurrentUser, logout, updateFirstName, uploadAvatar } from "./auth.js";
import { apiAssetUrl } from "./api.js";
import { getWorkspaces, getWorkspacesMembers, getWorkspaceById } from "./workspaces.js";
import { renderLogin as renderLoginView } from "./views/loginView.js";
import { renderDashboard } from "./views/dashboardView.js";
import { renderWorkspace as renderWorkspaceView } from "./views/workspaceView.js";
import { renderProject as renderProjectView } from "./views/projectView.js";
import { renderTask as renderTaskView } from "./views/taskView.js";
import { renderDirectMessages as renderDirectMessagesView } from "./views/directMessagesView.js";
import { renderRegister as renderRegisterView } from "./views/registerView.js";
import { getDirectConversations } from "./directMessages.js";

let viewVersion = 0;
let viewCleanups = [];
const navigation = { renderLogin, renderRegister, renderApp, renderWorkspace, renderProject, renderTask, renderDirectMessages, };
const systemTheme = window.matchMedia("(prefers-color-scheme: dark)");

function applyTheme(preference) {
    if (!["system", "light", "dark"].includes(preference)) preference = "system";
    document.documentElement.dataset.themePreference = preference;
    document.documentElement.dataset.theme = preference === "dark" ||
        (preference === "system" && systemTheme.matches) ? "dark" : "light";
    const toggle = document.querySelector("#theme-toggle");
    if (toggle) {
        const label = document.documentElement.dataset.theme === "dark" ? "Switch to light mode" : "Switch to dark mode";
        toggle.setAttribute("aria-label", label);
        toggle.title = label;
    }
}
applyTheme(document.documentElement.dataset.themePreference);
systemTheme.addEventListener("change", () => {
    if (document.documentElement.dataset.themePreference === "system") applyTheme("system");
});
window.addEventListener("storage", event => {
    if (event.key === "taskflow-theme" || event.key === null) applyTheme(event.newValue);
});

async function showView(render, layout) {
    const version = ++viewVersion;
    viewCleanups.forEach(cleanup => cleanup());
    viewCleanups = [];
    const context = {
        ...navigation,
        isCurrent: () => version === viewVersion,
        onCleanup(cleanup) {
            if (version === viewVersion) viewCleanups.push(cleanup);
            else cleanup();
        }
    };
    if (layout) {
        const page = await renderLayout({...layout, navigation: context });
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
        document.getElementById("page-content") ?.setAttribute("aria-labelledby", heading.id);
        heading.focus({ preventScroll: true });
    }
    window.scrollTo(0, 0);
}

function renderLogin(error = "") {
    return showView(context => renderLoginView(context, error));
}

function renderRegister() {
    return showView(context => renderRegisterView(context));
}

function renderApp(user) {
    return showView(context => renderDashboard(user, context), { user, pageClass: "dashboard-page" });
}

function renderWorkspace(workspace, initialTab = "projects") {
    return showView(context => renderWorkspaceView(workspace, {...context, initialTab }), {
        workspace,
        pageClass: "workspace-page",
        breadcrumbs: [{ label: "Workspaces", action: () => renderApp() }, { label: workspace.name }]
    });
}

function renderDirectMessages(member, workspace = null) {
    return showView(context => renderDirectMessagesView(member, workspace, context), {
        workspace,
        activeConversationId: member.user_id,
        pageClass: "direct-messages-page",
        breadcrumbs: [
            { label: "Workspaces", action: () => renderApp() },
            ...(workspace ? [{ label: workspace.name, action: () => renderWorkspace(workspace, "members") }] : []),
            { label: "Direct messages" }
        ]
    });
}

function renderProject(project, workspace) {
    return showView(context => renderProjectView(project, workspace, context), {
        workspace,
        pageClass: "project-page",
        breadcrumbs: [
            { label: "Workspaces", action: () => renderApp() },
            { label: workspace.name, action: () => renderWorkspace(workspace) },
            { label: project.name }
        ]
    });
}

function renderTask(task, project, workspace) {
    return showView(context => renderTaskView(task, project, workspace, context), {
        workspace,
        pageClass: "task-page",
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

async function renderLayout({
    navigation,
    user,
    workspace = null,
    activeConversationId = null,
    breadcrumbs = [{ label: "Workspaces" }],
    pageClass = ""
}) {
    const app = document.getElementById("app");
    app.setAttribute("aria-busy", "true");
    const [userResult, workspaceResult, membersResult, conversationsResult] = await Promise.all([
        user && "first_name" in user && "avatar_url" in user
            ? Promise.resolve({ ok: true, data: user }) : getCurrentUser(),
        getWorkspaces(),
        workspace ? getWorkspacesMembers(workspace.id) : Promise.resolve({ ok: true, data: [] }),
        getDirectConversations()
    ]);
    if (navigation.isCurrent && !navigation.isCurrent()) return null;
    app.removeAttribute("aria-busy");
    if (!userResult.ok) {
        navigation.renderLogin(userResult.status === 401 ? "" : userResult.data.error);
        return null;
    }
    if (workspaceResult.status === 401 || membersResult.status === 401 || conversationsResult.status === 401) {
        navigation.renderLogin();
        return null;
    }

    user = userResult.data;
    const workspaces = workspaceResult.ok ? workspaceResult.data : [];
    const members = membersResult.ok ? membersResult.data : null;
    const isOwner = Boolean(workspace && Number(workspace.owner_id) === Number(user.id));
    const role = isOwner ? "owner" : members ?.find(member =>
        Number(member.user_id) === Number(user.id)) ?.role ?? null;

    app.innerHTML = `
        <div class="app-layout">
            <aside class="sidebar" aria-label="Workspace navigation">
                <div class="sidebar-header"><img class="icon icon-mark" src="./assets/icons/mark.svg" width="24" height="24" alt="" aria-hidden="true"><span>TaskFlow</span></div>
                <nav class="sidebar-navigation" aria-label="Workspaces">
                    <button type="button" id="all-workspaces-button" class="workspace-button ${workspace || activeConversationId ? "" : "is-active"}"
                        ${workspace || activeConversationId ? "" : 'aria-current="page"'}><img class="icon icon-workspace" src="./assets/icons/workspace.svg" width="18" height="18" alt="" aria-hidden="true"><span>All workspaces</span></button>
                   <p class="sidebar-label">Workspaces</p>
                    <div id="workspace-list"></div>
                    <p id="sidebar-message" class="form-message" role="alert" hidden></p>

                    <p class="sidebar-label">Messages</p>
                    <div id="conversation-list"></div>
                    <p id="conversation-message" class="form-message" role="alert" hidden></p>
                </nav>
                <div class="sidebar-account">
                    <button type="button" id="profile-button" class="account-profile" aria-label="Edit your profile">
                        <span class="avatar" aria-hidden="true"><span class="avatar-initial"></span><img alt="" hidden></span>
                        <span class="account-details"><span class="account-name"></span><span class="account-email">${escapeHTML(user.email)}</span></span>
                    </button>
                </div>
            </aside>
            <main class="main-content">
                <header class="main-header">
                    <nav class="breadcrumbs" aria-label="Breadcrumb"></nav>
                    <button id="theme-toggle" type="button" class="theme-toggle" aria-label="Switch theme">
                        <svg class="theme-moon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.9 13.3A9 9 0 0 1 10.7 3.1 9 9 0 1 0 20.9 13.3Z"/></svg>
                        <svg class="theme-sun" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>
                    </button>
                </header>
                <section id="page-content" class="page-content ${escapeHTML(pageClass)}" tabindex="-1"></section>
            </main>
        </div>`;

    const content = app.querySelector("#page-content");
    const sidebarMessage = app.querySelector("#sidebar-message");
    const workspaceList = app.querySelector("#workspace-list");
    const conversationList = app.querySelector("#conversation-list");
    const conversationMessage = app.querySelector("#conversation-message");
    const breadcrumbList = app.querySelector(".breadcrumbs");
    const themeToggle = app.querySelector("#theme-toggle");
    applyTheme(document.documentElement.dataset.themePreference);
    themeToggle.addEventListener("click", () => {
        const preference = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
        applyTheme(preference);
        try {
            localStorage.setItem("taskflow-theme", preference);
        } catch {
            themeToggle.title += " (for this visit; preference could not be saved)";
        }
    });
    const current = () => content.isConnected && (!navigation.isCurrent || navigation.isCurrent());
    const updateUser = updated => {
        Object.assign(user, updated);
        const name = user.first_name || user.username || user.email;
        app.querySelector(".account-name").textContent = name;
        app.querySelector(".avatar-initial").textContent = Array.from(name)[0] ?.toUpperCase() || "?";
        const avatar = app.querySelector("#profile-button .avatar img");
        const url = apiAssetUrl(user.avatar_url);
        avatar.hidden = !url;
        avatar.onerror = () => { avatar.hidden = true; };
        if (url) avatar.src = url;
        else avatar.removeAttribute("src");
    };
    updateUser(user);
    setupProfileDialog(app, user, updateUser, current, navigation);

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
        const color = ["gray", "blue", "green", "yellow", "orange", "red", "purple"].includes(item.color) ? item.color : "gray";
        button.dataset.color = color;
        button.innerHTML = `<span class="workspace-icon" data-color="${color}" aria-hidden="true"></span><span>${escapeHTML(item.name)}</span>`;
        const icon = button.querySelector(".workspace-icon");
        if (item.icon_type === "emoji" && item.icon_value) icon.textContent = item.icon_value;
        else {
            const image = document.createElement("img");
            image.alt = "";
            image.onerror = () => {
                image.onerror = null;
                image.src = "./assets/icons/folder.svg";
            };
            image.src = item.icon_type === "image" && apiAssetUrl(item.icon_value) || "./assets/icons/folder.svg";
            icon.appendChild(image);
        }
        button.title = item.name;
        if (!activeConversationId && workspace && Number(item.id) === Number(workspace.id)) {
            button.classList.add("is-active");
            button.setAttribute("aria-current", "page");
        }
        button.addEventListener("click", () => withBusy(button, async() => {
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
    function displayConversations(result) {
        setMessage(conversationMessage, result.ok ? "" : result.data.error);
        if (!result.ok) return;
        conversationList.replaceChildren();
        for (const conversation of result.data) {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "workspace-button conversation-button";
            const name = conversation.first_name || conversation.username || "User";
            const initial = Array.from(name)[0]?.toUpperCase() || "?";
            button.innerHTML = `
                <span class="avatar" aria-hidden="true"><span>${escapeHTML(initial)}</span><img alt="" hidden></span>
                <span class="conversation-copy"><span>${escapeHTML(name)}</span><span class="conversation-preview"></span></span>`;
            button.title = name;
            button.querySelector(".conversation-preview").textContent = conversation.last_message;
            const avatar = button.querySelector("img");
            const url = apiAssetUrl(conversation.avatar_url);
            avatar.hidden = !url;
            avatar.onerror = () => { avatar.hidden = true; };
            if (url) avatar.src = url;
            if (Number(conversation.user_id) === Number(activeConversationId)) {
                button.classList.add("is-active");
                button.setAttribute("aria-current", "page");
            }
            button.addEventListener("click", () => navigation.renderDirectMessages(conversation));
            conversationList.appendChild(button);
        }
        if (!result.data.length) {
            const empty = document.createElement("p");
            empty.className = "sidebar-empty";
            empty.textContent = "No conversations yet.";
            conversationList.appendChild(empty);
        }
    }
    let conversationVersion = 0;
    async function refreshConversations() {
        const version = ++conversationVersion;
        const result = await getDirectConversations();
        if (!current() || version !== conversationVersion) return;
        if (result.status === 401) return navigation.renderLogin();
        displayConversations(result);
    }
    displayConversations(conversationsResult);
    return {
        content,
        user,
        updateUser,
        refreshConversations,
        workspaces,
        members,
        role,
        isOwner,
        membersError: membersResult.ok ? "" : membersResult.data.error,
        workspacesError: workspaceResult.ok ? "" : workspaceResult.data.error
    };
}

function setupProfileDialog(app, user, updateUser, current, navigation) {
    const dialog = document.createElement("dialog");
    dialog.id = "profile-dialog";
    dialog.className = "app-dialog";
    dialog.setAttribute("aria-labelledby", "profile-dialog-title");
    dialog.innerHTML = `
        <div class="dialog-header">
            <h2 id="profile-dialog-title">Your profile</h2>
            <button type="button" class="dialog-close" aria-label="Close profile">×</button>
        </div>
        <div class="dialog-body">
            <div class="profile-identity">
                <span class="avatar avatar-large" aria-hidden="true"><span id="profile-initial"></span><img id="profile-avatar" alt="" hidden></span>
                <div class="heading-copy">
                    <strong>${escapeHTML(user.username)}</strong>
                    <div class="email-copy"><span id="user-email" class="secondary-text">${escapeHTML(user.email)}</span><button id="copy-email-button" type="button" class="btn-quiet">Copy email</button></div>
                </div>
            </div>
            <form id="profile-name-form" class="settings-form profile-section">
                <div class="field">
                    <label for="profile-first-name">First name</label>
                    <input id="profile-first-name" name="first_name" value="${escapeHTML(user.first_name)}" autocomplete="given-name" maxlength="100" placeholder="Enter your first name" required>
                </div>
                <button type="submit" class="btn-primary">Save name</button>
                <p id="profile-name-message" class="form-message" role="status" hidden></p>
            </form>
            <form id="profile-avatar-form" class="settings-form profile-section">
                <div class="field">
                    <label for="profile-avatar-input">Profile picture</label>
                    <input id="profile-avatar-input" class="image-upload-input" type="file" name="avatar" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" required aria-describedby="profile-avatar-help">
                    <p id="profile-avatar-help" class="field-hint">JPG, PNG or WebP · up to 5 MB</p>
                </div>
                <button type="submit" class="btn-secondary">Upload picture</button>
                <p id="profile-avatar-message" class="form-message" role="status" hidden></p>
            </form>
            <div class="settings-form profile-section">
                <button type="button" id="logout-button" class="btn-secondary">Sign out</button>
                <p id="profile-logout-message" class="form-message" role="alert" hidden></p>
            </div>
        </div>`;
    app.appendChild(dialog);
    app.querySelector("#profile-button").addEventListener("click", () => dialog.showModal());
    dialog.querySelector(".dialog-close").addEventListener("click", () => { if (!profileBusy) dialog.close(); });
    dialog.addEventListener("cancel", event => { if (profileBusy) event.preventDefault(); });
    const profileNameForm = dialog.querySelector("#profile-name-form");
    const profileAvatarForm = dialog.querySelector("#profile-avatar-form");
    const profileButtons = dialog.querySelectorAll('button[type="submit"], #logout-button');
    let profileBusy = false;
    dialog.querySelector("#logout-button").addEventListener("click", async() => {
        if (profileBusy) return;
        profileBusy = true;
        dialog.setAttribute("aria-busy", "true");
        profileButtons.forEach(button => { button.disabled = true; });
        const feedback = dialog.querySelector("#profile-logout-message");
        setMessage(feedback);
        try {
            const result = await logout();
            if (!current()) return;
            if (result.ok || result.status === 401) navigation.renderLogin();
            else setMessage(feedback, result.data.error);
        } finally {
            profileBusy = false;
            dialog.removeAttribute("aria-busy");
            profileButtons.forEach(button => { button.disabled = false; });
        }
    });
    const displayProfile = () => {
        dialog.querySelector("#profile-initial").textContent = Array.from(user.first_name || user.username || user.email)[0] ?.toUpperCase() || "?";
        const avatar = dialog.querySelector("#profile-avatar");
        const url = apiAssetUrl(user.avatar_url);
        avatar.hidden = !url;
        avatar.onerror = () => { avatar.hidden = true; };
        if (url) avatar.src = url;
        else avatar.removeAttribute("src");
    };
    displayProfile();
    const saveProfile = async(request, feedback, onSuccess) => {
        if (profileBusy) return;
        profileBusy = true;
        dialog.setAttribute("aria-busy", "true");
        profileButtons.forEach(button => { button.disabled = true; });
        setMessage(feedback);
        try {
            const result = await request();
            if (!current()) return;
            if (!result.ok) return setMessage(feedback, result.data.error);
            updateUser(result.data);
            displayProfile();
            onSuccess();
            setMessage(feedback, "Profile updated.", "success");
        } finally {
            profileBusy = false;
            dialog.removeAttribute("aria-busy");
            profileButtons.forEach(button => { button.disabled = false; });
        }
    };
    profileNameForm.addEventListener("submit", event => {
        event.preventDefault();
        const input = profileNameForm.elements.first_name;
        const enteredName = input.value;
        const name = enteredName.trim();
        const feedback = dialog.querySelector("#profile-name-message");
        if (!name) return setMessage(feedback, "Enter your first name.");
        saveProfile(() => updateFirstName(name), feedback, () => {
            if (input.value === enteredName) input.value = user.first_name;
        });
    });
    profileAvatarForm.addEventListener("submit", event => {
        event.preventDefault();
        const input = profileAvatarForm.elements.avatar;
        const file = input.files[0];
        const feedback = dialog.querySelector("#profile-avatar-message");
        if (!file) return setMessage(feedback, "Choose an image first.");
        if (!/\.(jpe?g|png|webp)$/i.test(file.name) || !["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
            return setMessage(feedback, "Choose a JPG, PNG or WebP image.");
        }
        if (file.size > 5 * 1024 * 1024) return setMessage(feedback, "Choose an image smaller than 5 MB.");
        saveProfile(() => uploadAvatar(file), feedback, () => {
            if (input.files[0] === file) input.value = "";
        });
    });

    const copy = dialog.querySelector("#copy-email-button");
    copy.addEventListener("click", () => withBusy(copy, async() => {
        try {
            await navigator.clipboard.writeText(user.email);
            if (!current()) return;
            copy.textContent = "Copied!";
            window.setTimeout(() => { if (copy.isConnected) copy.textContent = "Copy email"; }, 1500);
        } catch {
            setMessage(dialog.querySelector("#profile-name-message"), "Could not copy the email. You can select and copy it manually.");
        }
    }));

}

function escapeHTML(value = "") {
    return String(value ?? "").replace(/[&<>"']/g, character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
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
