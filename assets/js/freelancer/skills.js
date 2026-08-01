// skills.js — SUPABASE VERSION
import { supabase, getCurrentUser, uploadFile } from '../api.js';

document.addEventListener("DOMContentLoaded", () => {
    loadSkills();
    loadSkillOptions();
    const addSkillBtn = document.getElementById("addSkillBtn");
    if (addSkillBtn) addSkillBtn.addEventListener("click", addSkill);
});

// Load freelancer skills with verification status
async function loadSkills() {
    try {
        const user = await getCurrentUser();
        if (!user) return;

        const { data: skills, error } = await supabase
            .from('freelancer_skill')
            .select(`
                *,
                skill:skill_id(*),
                verifications:skill_verification(*)
            `)
            .eq('freelancer_id', user.id);
        if (error) throw error;

        const verifiedContainer = document.getElementById("verifiedSkills");
        const pendingContainer = document.getElementById("pendingSkills");
        const unverifiedContainer = document.getElementById("unverifiedSkills");

        if (verifiedContainer) verifiedContainer.innerHTML = "";
        if (pendingContainer) pendingContainer.innerHTML = "";
        if (unverifiedContainer) unverifiedContainer.innerHTML = "";

        if (!skills || skills.length === 0) {
            if (verifiedContainer) verifiedContainer.innerHTML = '<div class="empty-state">No verified skills yet</div>';
            if (pendingContainer) pendingContainer.innerHTML = '<div class="empty-state">No pending verifications</div>';
            if (unverifiedContainer) unverifiedContainer.innerHTML = '<div class="empty-state">No unverified skills</div>';
            return;
        }

        skills.forEach(skill => {
            const div = document.createElement("div");
            div.className = "skill-card";
            div.innerHTML = `<p>${skill.skill?.skill_name || 'Unknown Skill'}</p>`;

            if (skill.verified) {
                div.innerHTML += `<span class="badge verified">Verified</span>`;
                if (verifiedContainer) verifiedContainer.appendChild(div);
            } else {
                const verifications = skill.verifications || [];
                if (verifications.length > 0) {
                    const latest = verifications.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
                    if (latest.status === "pending") {
                        div.innerHTML += `<span class="badge pending">Pending</span>`;
                        if (pendingContainer) pendingContainer.appendChild(div);
                    } else if (latest.status === "rejected") {
                        div.innerHTML += `<span class="badge rejected">Rejected</span>`;
                        const btn = document.createElement("button");
                        btn.textContent = "Verify Again";
                        btn.className = "btn btn-outline";
                        btn.addEventListener("click", () => showVerifyForm(skill.id, div));
                        div.appendChild(btn);
                        if (unverifiedContainer) unverifiedContainer.appendChild(div);
                    } else {
                        const btn = document.createElement("button");
                        btn.textContent = "Verify Now";
                        btn.className = "btn btn-primary";
                        btn.addEventListener("click", () => showVerifyForm(skill.id, div));
                        div.appendChild(btn);
                        if (unverifiedContainer) unverifiedContainer.appendChild(div);
                    }
                } else {
                    const btn = document.createElement("button");
                    btn.textContent = "Verify Now";
                    btn.className = "btn btn-primary";
                    btn.addEventListener("click", () => showVerifyForm(skill.id, div));
                    div.appendChild(btn);
                    if (unverifiedContainer) unverifiedContainer.appendChild(div);
                }
            }
        });
    } catch (error) {
        console.error("Error loading skills:", error);
        showNotification("Failed to load skills", "error");
    }
}

// Load skill options from skill table
async function loadSkillOptions() {
    try {
        const { data: skills, error } = await supabase
            .from('skill')
            .select('*')
            .order('skill_name', { ascending: true });
        if (error) throw error;

        const select = document.getElementById("skillSelect");
        if (!select) return;
        while (select.children.length > 1) select.removeChild(select.lastChild);
        skills.forEach(skill => {
            const opt = document.createElement("option");
            opt.value = skill.id;
            opt.textContent = skill.skill_name;
            select.appendChild(opt);
        });
    } catch (error) {
        console.error("Error loading skill options:", error);
        showNotification("Failed to load skill options", "error");
    }
}

// Add new skill - with duplicate prevention
async function addSkill() {
    const skillSelect = document.getElementById("skillSelect");
    const skillId = parseInt(skillSelect?.value);
    const skillName = skillSelect?.selectedOptions[0]?.text;
    if (!skillId || !skillName) {
        alert("Please select a skill.");
        return;
    }

    // Check if skill already exists in any list (by name)
    const existingSkillNames = Array.from(document.querySelectorAll('.skill-card p')).map(el => el.textContent);
    if (existingSkillNames.includes(skillName)) {
        alert("You already have this skill.");
        return;
    }

    try {
        const user = await getCurrentUser();
        if (!user) return;

        const { error } = await supabase
            .from('freelancer_skill')
            .insert({
                freelancer_id: user.id,
                skill_id: skillId
            });
        if (error) throw error;

        showNotification("Skill added successfully!", "success");
        skillSelect.value = "";
        loadSkills();
    } catch (error) {
        console.error("Error adding skill:", error);
        alert("Could not add skill: " + (error.message || error));
    }
}

// Show verification form
function showVerifyForm(freelancerSkillId, parentDiv) {
    if (parentDiv.querySelector(".verify-form")) return;

    const tmpl = document.getElementById("verifyFormTemplate");
    if (!tmpl) return;
    const form = tmpl.content.cloneNode(true);
    const formEl = form.querySelector("form");

    formEl.addEventListener("submit", async (e) => {
        e.preventDefault();
        const years = e.target.years_experience.value;
        const reference = e.target.reference_link.value;
        const file = e.target.proof.files[0];

        if (!years || years < 0) {
            alert("Please enter a valid number of years of experience.");
            return;
        }
        if (!reference) {
            alert("Please provide a reference link.");
            return;
        }

        const submitBtn = e.target.querySelector('button[type="submit"]');
        const originalText = submitBtn?.textContent;
        if (submitBtn) {
            submitBtn.textContent = "Submitting...";
            submitBtn.disabled = true;
        }

        try {
            const user = await getCurrentUser();
            if (!user) throw new Error("Not authenticated");

            let proofPath = null;
            let proofUrl = null;

            // Upload proof file if provided
            if (file) {
                if (file.size > 5 * 1024 * 1024) {
                    alert("File size must be less than 5MB.");
                    if (submitBtn) {
                        submitBtn.textContent = originalText;
                        submitBtn.disabled = false;
                    }
                    return;
                }
                const filePath = `${user.id}/${Date.now()}_${file.name}`;
                proofUrl = await uploadFile('proof', filePath, file);
                proofPath = filePath;
            }

            // Insert skill verification record
            const { error } = await supabase
                .from('skill_verification')
                .insert({
                    freelancer_skill_id: freelancerSkillId,
                    years_experience: parseInt(years),
                    reference_link: reference,
                    proof_url: proofUrl,
                    proof: proofPath,
                    status: 'pending'
                });
            if (error) throw error;

            showNotification("Verification submitted successfully!", "success");
            loadSkills();

        } catch (error) {
            console.error("Error submitting verification:", error);
            alert("Verification request failed: " + (error.message || error));
        } finally {
            if (submitBtn) {
                submitBtn.textContent = originalText;
                submitBtn.disabled = false;
            }
        }
    });

    const cancelBtn = document.createElement("button");
    cancelBtn.textContent = "Cancel";
    cancelBtn.type = "button";
    cancelBtn.className = "btn btn-outline";
    cancelBtn.style.marginLeft = "10px";
    cancelBtn.addEventListener("click", () => {
        const verifyForm = parentDiv.querySelector(".verify-form");
        if (verifyForm) parentDiv.removeChild(verifyForm);
    });

    formEl.appendChild(cancelBtn);
    parentDiv.appendChild(form);
}

// Utility function to show notifications
function showNotification(message, type = "info") {
    const notification = document.createElement("div");
    notification.className = `notification ${type}`;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 12px 20px;
        border-radius: var(--radius-md);
        color: var(--text-primary);
        font-weight: 600;
        z-index: 10000;
        animation: slideInRight 0.3s ease-out;
        max-width: 300px;
    `;

    if (type === "success") {
        notification.style.background = "var(--gradient-secondary)";
    } else if (type === "error") {
        notification.style.background = "linear-gradient(135deg, #ff5c8d 0%, #e91e63 100%)";
    } else {
        notification.style.background = "var(--gradient-primary)";
    }

    notification.textContent = message;
    document.body.appendChild(notification);

    setTimeout(() => {
        notification.style.animation = "slideOutRight 0.3s ease-in";
        setTimeout(() => {
            if (notification.parentNode) notification.parentNode.removeChild(notification);
        }, 300);
    }, 3000);
}

// Add CSS for notification animations
const style = document.createElement('style');
style.textContent = `
    @keyframes slideInRight {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
    @keyframes slideOutRight {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
    }
    .empty-state {
        text-align: center; padding: var(--space-8); color: var(--text-muted); font-style: italic;
    }
`;
document.head.appendChild(style);

// Theme Toggle
function initThemeToggle() {
    const themeToggle = document.getElementById('themeToggle');
    if (!themeToggle) return;
    const themeIcon = themeToggle.querySelector('.theme-icon');
    const themeLabel = themeToggle.querySelector('.theme-label');
    const savedTheme = localStorage.getItem('theme');
    const prefersLight = window.matchMedia('(prefers-color-scheme: light)').matches;

    if (savedTheme === 'light' || (!savedTheme && prefersLight)) {
        document.documentElement.setAttribute('data-theme', 'light');
        if (themeIcon) themeIcon.textContent = '🌙';
        if (themeLabel) themeLabel.textContent = 'Dark Mode';
    } else {
        document.documentElement.setAttribute('data-theme', 'dark');
        if (themeIcon) themeIcon.textContent = '☀️';
        if (themeLabel) themeLabel.textContent = 'Light Mode';
    }

    themeToggle.addEventListener('click', () => {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        if (currentTheme === 'light') {
            document.documentElement.setAttribute('data-theme', 'dark');
            if (themeIcon) themeIcon.textContent = '☀️';
            if (themeLabel) themeLabel.textContent = 'Light Mode';
            localStorage.setItem('theme', 'dark');
        } else {
            document.documentElement.setAttribute('data-theme', 'light');
            if (themeIcon) themeIcon.textContent = '🌙';
            if (themeLabel) themeLabel.textContent = 'Dark Mode';
            localStorage.setItem('theme', 'light');
        }
    });
}

document.addEventListener('DOMContentLoaded', initThemeToggle);