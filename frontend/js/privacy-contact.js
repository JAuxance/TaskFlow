import { apiRequest } from "./api.js";

export async function setupPrivacyContact(root = document) {
    const container = root.querySelector("[data-privacy-contact]");
    if (!container) return;
    const result = await apiRequest("/api/privacy");
    if (!container.isConnected) return;
    if (!result.ok || !result.data.contact_email) return;
    const link = document.createElement("a");
    link.href = `mailto:${result.data.contact_email}?subject=TaskFlow%20-%20personal%20data%20request`;
    link.textContent = result.data.contact_email;
    container.replaceChildren("For data requests: ", link, ". Please never send your password.");
}

setupPrivacyContact();
