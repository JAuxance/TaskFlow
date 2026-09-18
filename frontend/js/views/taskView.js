import { getWorkspacesMembers } from "../workspaces.js";
import { updateTask, deleteTask } from "../task.js";

export async function renderTask(task, project, workspace, { renderProject }) {
    const app = document.getElementById("app");

    app.innerHTML = `
    <button id="back-task-button">← Retour</button>
    
    <label for="task-title">Titre:</label>
    <input
        id="task-title"
        type="text"
        value="${task.title}"
    >

    <label for="task-description">Description :</label>
    <textarea id="task-description">${task.description || ""}</textarea>

    <label for="tasks-status">Status: </label>
    <select id="task-status">
        <option value="todo">Todo</option>
        <option value="in_progress">In porgress</option>
        <option value="review">Review</option>
        <option value="done">Done</option>
    </select>
    <label for="task-priority">Priorité :</label>
    <select id="task-priority">
        <option value="low">Low</option>
        <option value="medium">Medium</option>
        <option value="high">High</option>
        <option value="urgent">Urgent</option>
    </select>
    <label for="task-due-date">Échéance :</label>
    <input
        id="task-due-date"
        type="datetime-local"
    >
    <label for="task-assignee">Assigné à:</label>
    <select id="task-assignee">
        <option value="">Non assignée</option>
    </select>
    <button id="save-task-button">Engregistrer</button>
    <button id="delete-task-button">Supprimer la tâche</button>
    `;
    const statusSelect = document.getElementById("task-status");

    statusSelect.value = task.status;
    statusSelect.addEventListener("change", async function() {
        const newStatus = statusSelect.value;

        const result = await updateTask(task.id, {
            status: newStatus
        });

        console.log(result)
    });

    const prioritySelect = document.getElementById("task-priority");

    prioritySelect.value = task.priority;

    prioritySelect.addEventListener("change", async function() {
        const newPriority = prioritySelect.value;

        const result = await updateTask(task.id, {
            priority: newPriority
        });

        console.log(result);
    });
    const dueDateInput = document.getElementById("task-due-date");
    if (task.due_date) {
        dueDateInput.value = task.due_date.slice(0, 16);
    }
    const membersResult = await getWorkspacesMembers(workspace.id);
    const assigneeSelect = document.getElementById("task-assignee");

    if (membersResult.ok) {
        const members = membersResult.data;

        members.forEach(function(member) {
            const option = document.createElement("option");

            option.value = member.user_id;
            option.textContent = member.user_name;

            assigneeSelect.appendChild(option);

        });
        if (task.assignee_id) {
            assigneeSelect.value = String(task.assignee_id);
        }
    }
    const titleInput = document.getElementById("task-title");
    const descriptionInput = document.getElementById("task-description");
    const saveTaskButton = document.getElementById("save-task-button");
    saveTaskButton.addEventListener("click", async function() {
        const data = {
            title: titleInput.value,
            description: descriptionInput.value,
            assignee_id: assigneeSelect.value ?
                Number(assigneeSelect.value) : null
        };

        if (dueDateInput.value) {
            data.due_date = dueDateInput.value;
        }

        const result = await updateTask(task.id, data);

        if (result.ok) {
            renderProject(project, workspace);
        } else {
            console.log(result);
        }
    });
    const deleteTaskButton = document.getElementById("delete-task-button");
    deleteTaskButton.addEventListener("click", async function() {
        const confirmed = confirm("Supprimer cette tâche ?");

        if (!confirmed) {
            return;
        }

        const result = await deleteTask(task.id);

        if (result.ok) {
            renderProject(project, workspace);
        }
    });
    const backButton = document.getElementById("back-task-button");

    backButton.addEventListener("click", function() {
        renderProject(project, workspace);
    });
    console.log(task.assignee_id);
}
