<script setup lang="ts">
// Presentation of TaskFlow, shown at "/" to a visitor who is not signed in.
import { RouterLink } from 'vue-router';
import markIcon from '../assets/icons/mark.svg';
import workspaceDark from '../assets/landing/workspace-dark.png';
import workspaceLight from '../assets/landing/workspace-light.png';

const PREVIEW = 'A workspace in TaskFlow: its totals in colored blocks, its projects with their progress, and the tasks to focus on.';
const FEATURES = [
    { title: 'Workspaces', text: 'One space per team, with a role for each member.' },
    { title: 'Kanban boards', text: 'See progress at a glance and edit tasks in a single form.' },
    { title: 'Team roles', text: 'Owner, admin, member and guest: access adapted to each person.' },
    { title: 'Your data', text: 'Download it, or delete your account, at any time.' },
];
</script>

<template>
    <div class="landing">
        <header class="landing-header">
            <div class="landing-brand"><img class="icon icon-mark" :src="markIcon" width="32" height="32" alt=""><span>TaskFlow</span></div>
            <RouterLink class="btn-secondary" :to="{ name: 'login' }">Log in</RouterLink>
        </header>
        <main id="page-content" class="landing-main" tabindex="-1">
            <section class="landing-hero">
                <h1 data-tab-title="TaskFlow">Plan projects. Organize tasks. Work together.</h1>
                <p class="landing-lead">Workspaces, Kanban boards and clear responsibilities, in one place.</p>
                <RouterLink class="btn-primary" :to="{ name: 'register' }">Create an account</RouterLink>
            </section>
            <!-- A real screen of the application, in the theme being displayed. -->
            <figure class="landing-preview">
                <img class="landing-shot landing-shot-light" :src="workspaceLight" width="1440" height="1174" :alt="PREVIEW">
                <img class="landing-shot landing-shot-dark" :src="workspaceDark" width="1440" height="1174" :alt="PREVIEW">
            </figure>
            <ul class="landing-features" aria-label="What TaskFlow offers">
                <li v-for="feature in FEATURES" :key="feature.title" class="landing-feature">
                    <h2>{{ feature.title }}</h2>
                    <p>{{ feature.text }}</p>
                </li>
            </ul>
        </main>
    </div>
</template>
