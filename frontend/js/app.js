import { getCurrentUser } from "./auth.js";
import { renderLogin as renderLoginView } from "./views/loginView.js";
import { renderDashboard } from "./views/dashboardView.js";
import { renderWorkspace as renderWorkspaceView } from "./views/workspaceView.js";
import { renderProject as renderProjectView } from "./views/projectView.js";
import { renderTask as renderTaskView } from "./views/taskView.js";

const navigation = { renderLogin, renderApp, renderWorkspace, renderProject, renderTask };

function renderLogin() {
    return renderLoginView(navigation);
}

async function renderApp(user) {
    return renderDashboard(user, navigation);
}

async function renderWorkspace(workspace) {
    return renderWorkspaceView(workspace, navigation);
}

async function renderProject(project, workspace) {
    return renderProjectView(project, workspace, navigation);
}

async function renderTask(task, project, workspace) {
    return renderTaskView(task, project, workspace, navigation);
}

async function initApp() {
    const userResult = await getCurrentUser();

    if (userResult.ok) {
        renderApp(userResult.data);
    } else {
        renderLogin();
    }
}

initApp();