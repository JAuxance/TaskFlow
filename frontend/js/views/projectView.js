import { updateProject, deleteProject } from "../projects.js";
import { getTasks, createTask, getTaskById } from "../task.js";

export async function renderProject(project, workspace, { renderWorkspace, renderProject, renderTask }) {
    const app = document.getElementById("app");

    app.innerHTML = `
        <button id="back-project-button">← Retour</button>

        <label for="project-name">Nom :</label>
        <input
            id="project-name"
            type="text"
            value="${project.name}"
        >

        <label for="project-description">Description:</label>
        <textarea id="project-description">${project.description || ""}</textarea>

        <button id="save-project-button">Enregistrer</button>
        <button id="delete-project-button">Supprimer le projet</button>
        <div id="tasks-list"></div>
    `;
    const deleteProjectButton = document.getElementById("delete-project-button");

    deleteProjectButton.addEventListener("click", async function() {
        const confirmed = confirm("Supprimer ce projet ?");

        if (!confirmed) {
            return;
        }
        const result = await deleteProject(project.id);

        if (result.ok) {
            renderWorkspace(workspace);
        } else {
            console.log(result);
        }
    });

    const projectNameInput = document.getElementById("project-name");
    const projectDescriptionInput = document.getElementById("project-description");
    const saveProjectButton = document.getElementById("save-project-button");

    saveProjectButton.addEventListener("click", async function() {
        const result = await updateProject(project.id, {
            name: projectNameInput.value,
            description: projectDescriptionInput.value
        });

        if (result.ok) {
            renderWorkspace(workspace);
        } else {
            console.log(result);
        }
    });
    const tasksResult = await getTasks(project.id);

    const tasksList = document.getElementById("tasks-list")

    if (tasksResult.ok) {
        const tasks = tasksResult.data;

        if (tasks.length === 0) {
            tasksList.innerHTML = `
            <p>Aucune tâche pour le moment.</p>
            <button id="create-task-button">Créer une tâche</button>
            `;
        } else {
            tasksList.innerHTML = `
                <button id="create-task-button">Créer une tâche</button>
                `;

            tasks.forEach(function(task) {
                const taskElement = document.createElement("div");

                taskElement.innerHTML = `
                    <button class="open-task-button">
                        <strong>${task.title}</strong>
                    </button>

                    <p>Status: ${task.status}</p>
                    <p>Priorité: ${task.priority}</p>
                `;
                const openTaskButton = taskElement.querySelector(".open-task-button");
                openTaskButton.addEventListener("click", async function() {
                    const result = await getTaskById(task.id);

                    if (result.ok) {
                        renderTask(result.data, project, workspace);
                    }
                });

                tasksList.appendChild(taskElement);
            });
        }
        const createTaskbutton = document.getElementById("create-task-button");

        createTaskbutton.addEventListener("click", async function() {
            const title = prompt("Titre de la tâche :");

            if (!title) {
                return;
            }

            const result = await createTask(project.id, title);

            if (result.ok) {
                await renderProject(project, workspace);
            } else {
                alert(result.data.error || "Impossible de créer la tâche.");
            }
        });

    }

    const backButton = document.getElementById("back-project-button");

    backButton.addEventListener("click", function() {
        renderWorkspace(workspace);
    });
}
