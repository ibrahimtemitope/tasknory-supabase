// admin-badges.js — SUPABASE VERSION
// Import the global Supabase client + helpers
import { supabase, getCurrentUser } from '../api.js';

let currentUser = null;
let allBadges = [];

// Verify admin access on load
document.addEventListener("DOMContentLoaded", async () => {
    currentUser = await getCurrentUser();
    if (!currentUser || currentUser.role !== 'admin') {
        alert("Admin access required.");
        window.location.href = '../auth/login.html';
        return;
    }
    // Pre-load badges so the table renders faster
    await loadAllBadges();

    const btn = document.getElementById("loadBadgesOverviewBtn");
    if (btn) btn.addEventListener("click", loadBadgesOverview);

    // Attach the auto-calculation buttons
    const ladderBtn = document.getElementById("recalculateLadderBtn");
    if (ladderBtn) ladderBtn.addEventListener("click", recalculateLadderBadges);

    const achievementBtn = document.getElementById("recalculateAchievementBtn");
    if (achievementBtn) achievementBtn.addEventListener("click", recalculateAchievementBadges);
});

async function loadAllBadges() {
    try {
        const { data, error } = await supabase
            .from('badge')
            .select('*')
            .order('min_jobs', { ascending: true });
        if (error) throw error;
        allBadges = data || [];
    } catch (error) {
        console.error('Error loading badges:', error);
    }
}

// ========== BADGES OVERVIEW TABLE ==========

export async function loadBadgesOverview() {
    const container = document.getElementById("badgesOverview");
    if (!container) return;
    container.innerHTML = "<p>Loading overview...</p>";

    try {
        // Fetch all freelancers with their badge info
        const { data: freelancers, error } = await supabase
            .from('users')
            .select(`
                id,
                full_name,
                email,
                main_badge_id,
                main_badge:main_badge_id(name),
                achievements,
                tasknory_choice,
                tasknory_partner
            `)
            .eq('role', 'freelancer')
            .order('full_name', { ascending: true });
        if (error) throw error;

        if (!freelancers || freelancers.length === 0) {
            container.innerHTML = "<p>No freelancers found.</p>";
            return;
        }

        let table = `
            <table class="overview-table">
                <thead>
                    <tr>
                        <th>Name</th>
                        <th>Email</th>
                        <th>Main Badge</th>
                        <th>Achievements</th>
                        <th>Tasknory Choice</th>
                        <th>Tasknory Partner</th>
                        <th>Override Main Badge</th>
                    </tr>
                </thead>
                <tbody>
        `;

        freelancers.forEach(user => {
            const achievements = (user.achievements && user.achievements.length)
                ? user.achievements.join(", ")
                : "<i>None</i>";

            let badgeOptions = allBadges
                .map(b => `<option value="${b.id}" ${b.id === user.main_badge_id ? "selected" : ""}>${b.name}</option>`)
                .join("");
            // Add a "None" option
            badgeOptions = `<option value="">-- None --</option>` + badgeOptions;

            table += `
                <tr>
                    <td>${user.full_name || 'N/A'}</td>
                    <td>${user.email || 'N/A'}</td>
                    <td>${user.main_badge?.name || "<i>None</i>"}</td>
                    <td>${achievements}</td>
                    <td>
                        <button class="btn btn-sm ${user.tasknory_choice ? 'btn-danger' : 'btn-success'}" 
                            onclick="window.toggleBadge('${user.id}', 'tasknory_choice', ${user.tasknory_choice})">
                            ${user.tasknory_choice ? "Remove" : "Give"}
                        </button>
                    </td>
                    <td>
                        <button class="btn btn-sm ${user.tasknory_partner ? 'btn-danger' : 'btn-success'}" 
                            onclick="window.toggleBadge('${user.id}', 'tasknory_partner', ${user.tasknory_partner})">
                            ${user.tasknory_partner ? "Remove" : "Give"}
                        </button>
                    </td>
                    <td>
                        <select class="form-select" onchange="window.overrideMainBadge('${user.id}', this.value)">
                            ${badgeOptions}
                        </select>
                    </td>
                </tr>
            `;
        });

        table += "</tbody></table>";
        container.innerHTML = `<div class="table-container">${table}</div>`;
    } catch (error) {
        container.innerHTML = "<p class='error'>Error loading overview.</p>";
        console.error(error);
    }
}

// ========== TOGGLE BADGES (CHOICE / PARTNER) ==========

window.toggleBadge = async function (userId, field, currentValue) {
    try {
        const updateData = {};
        updateData[field] = !currentValue;

        const { error } = await supabase
            .from('users')
            .update(updateData)
            .eq('id', userId);
        if (error) throw error;

        alert("Badge updated successfully!");
        loadBadgesOverview();
    } catch (error) {
        alert("Failed to update badge: " + (error.message || error));
    }
};

// ========== OVERRIDE MAIN BADGE MANUALLY ==========

window.overrideMainBadge = async function (userId, badgeId) {
    try {
        // If badgeId is empty string, set to null (remove badge)
        const { error } = await supabase
            .from('users')
            .update({ main_badge_id: badgeId || null })
            .eq('id', userId);
        if (error) throw error;

        alert("Main badge overridden successfully!");
        loadBadgesOverview();
    } catch (error) {
        alert("Failed to override main badge: " + (error.message || error));
    }
};

// ========== AUTO-CALCULATE LADDER BADGES ==========
// Calls the PostgreSQL function: update_ladder_badges()
// This counts completed jobs and auto-assigns the correct main badge

async function recalculateLadderBadges() {
    const btn = document.getElementById("recalculateLadderBtn");
    const originalText = btn ? btn.textContent : 'Recalculate Ladder Badges';

    try {
        if (btn) {
            btn.disabled = true;
            btn.textContent = '🔄 Calculating...';
        }

        const { data: count, error } = await supabase.rpc('update_ladder_badges');
        if (error) throw error;

        alert(`✅ Ladder badges recalculated! ${count} freelancer(s) updated.`);
        loadBadgesOverview(); // refresh the table
    } catch (error) {
        console.error('Ladder badge recalculation error:', error);
        alert('❌ Failed to recalculate ladder badges: ' + (error.message || error));
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = originalText;
        }
    }
}

// ========== AUTO-CALCULATE ACHIEVEMENT BADGES ==========
// Calls the PostgreSQL function: update_achievement_badges()
// This checks verified IDs, skills, completed jobs, early adopter status, etc.

async function recalculateAchievementBadges() {
    const btn = document.getElementById("recalculateAchievementBtn");
    const originalText = btn ? btn.textContent : 'Recalculate Achievement Badges';

    try {
        if (btn) {
            btn.disabled = true;
            btn.textContent = '🔄 Calculating...';
        }

        const { data: count, error } = await supabase.rpc('update_achievement_badges');
        if (error) throw error;

        alert(`✅ Achievement badges recalculated! ${count} freelancer(s) updated.`);
        loadBadgesOverview(); // refresh the table
    } catch (error) {
        console.error('Achievement badge recalculation error:', error);
        alert('❌ Failed to recalculate achievement badges: ' + (error.message || error));
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = originalText;
        }
    }
}