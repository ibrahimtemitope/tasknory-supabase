// freelancer-profile.js — SUPABASE VERSION
// Import the global Supabase client
import { supabase, STORAGE_BASE } from './api.js';

const urlParams = new URLSearchParams(window.location.search);
const freelancerId = urlParams.get("id");

const nameEl = document.getElementById("freelancerName");
const langEl = document.getElementById("freelancerLanguage");
const toneEl = document.getElementById("freelancerTone");
const skillsList = document.getElementById("freelancerSkills");
const profilePic = document.getElementById("profilePicture");
const contractsDiv = document.getElementById("completedContracts");

if (!freelancerId) {
    document.body.innerHTML = "<p class='error'>No freelancer specified.</p>";
    throw new Error("No freelancer ID provided in URL");
}

async function loadFreelancerProfile() {
    try {
        // 1. Fetch freelancer profile (public data)
        const { data: freelancer, error: userError } = await supabase
            .from('users')
            .select(`
                id,
                full_name,
                tone,
                language,
                profile_picture,
                tasknory_choice,
                tasknory_partner,
                achievements,
                main_badge:main_badge_id(name)
            `)
            .eq('id', freelancerId)
            .eq('role', 'freelancer')
            .single();
        if (userError || !freelancer) throw new Error('Freelancer not found');

        // 2. Fetch skills
        const { data: skills, error: skillsError } = await supabase
            .from('freelancer_skill')
            .select(`
                *,
                skill:skill_id(skill_name)
            `)
            .eq('freelancer_id', freelancerId);
        if (skillsError) throw skillsError;

        // 3. Fetch hires with jobs, milestones, final submissions
        const { data: hires, error: hiresError } = await supabase
            .from('hire')
            .select(`
                *,
                job:job_id(*, milestones:milestone(*)),
                client:client_id(full_name)
            `)
            .eq('freelancer_id', freelancerId)
            .order('created_at', { ascending: false });
        if (hiresError) throw hiresError;

        // Build projects array matching the old Django response shape
        const projects = [];
        for (const hire of (hires || [])) {
            const job = hire.job;
            const milestones = job.milestones || [];
            const milestoneData = milestones.map(m => ({
                id: m.id,
                title: m.title,
                amount: m.amount,
                status: m.status
            }));

            let progressInfo = '';
            if (job.payment_type === 'milestone') {
                const approvedCount = milestones.filter(m => m.status === 'approved').length;
                const totalCount = milestones.length;
                progressInfo = `${approvedCount}/${totalCount} milestones completed`;
            } else {
                // For single payment, check final submission status
                const { data: finalSub } = await supabase
                    .from('final_submission')
                    .select('status')
                    .eq('hire_id', hire.id)
                    .maybeSingle();
                progressInfo = finalSub?.status || 'pending';
            }

            projects.push({
                id: hire.id,
                job_title: job.title,
                job_description: job.description,
                budget: job.budget,
                payment_type: job.payment_type,
                client_name: hire.client?.full_name || 'Unknown',
                created_at: hire.created_at,
                milestones: milestoneData,
                progress_info: progressInfo
            });
        }

        // Build the data object to match old structure
        const data = {
            id: freelancer.id,
            full_name: freelancer.full_name,
            tone: freelancer.tone,
            language: freelancer.language,
            profile_picture: freelancer.profile_picture,
            tasknory_choice: freelancer.tasknory_choice,
            tasknory_partner: freelancer.tasknory_partner,
            achievements: freelancer.achievements || [],
            main_badge: freelancer.main_badge?.name || null,
            skills: (skills || []).map(fs => ({
                skill_id: fs.skill_id,
                skill_name: fs.skill?.skill_name || 'Unknown',
                verified: fs.verified
            })),
            projects: projects
        };

        renderProfile(data);

    } catch (error) {
        console.error("Error loading freelancer:", error);
        document.body.innerHTML = "<p class='error'>Failed to load freelancer profile.</p>";
    }
}

function renderProfile(data) {
    if (nameEl) nameEl.textContent = data.full_name;

    // Ladder badge
    if (data.main_badge && nameEl) {
        const badgeEl = document.createElement("span");
        badgeEl.className = "ladder-badge";
        badgeEl.textContent = data.main_badge;
        nameEl.appendChild(document.createTextNode(" "));
        nameEl.appendChild(badgeEl);
    }

    // Manual badges
    const badgeContainer = document.getElementById("badgeContainer");
    if (badgeContainer) {
        badgeContainer.innerHTML = "";
        if (data.tasknory_choice) {
            badgeContainer.innerHTML += `<span class="badge choice">Tasknory Choice</span>`;
        }
        if (data.tasknory_partner) {
            badgeContainer.innerHTML += `<span class="badge partner">Tasknory Partner</span>`;
        }
    }

    // Achievements
    const achievementsEl = document.getElementById("freelancerAchievements");
    if (achievementsEl) {
        if (Array.isArray(data.achievements) && data.achievements.length > 0) {
            const achievementsHtml = data.achievements.map(a => `<span class="badge">${a}</span>`).join(" ");
            achievementsEl.innerHTML = achievementsHtml;
        } else {
            achievementsEl.innerHTML = "<i>No achievements yet</i>";
        }
    }

    if (langEl) langEl.textContent = data.language || "-";
    if (toneEl) toneEl.textContent = data.tone || "-";

    if (profilePic && data.profile_picture) {
        // If it's already a full URL, use it. If it's a path, construct Storage URL
        let picUrl = data.profile_picture;
        if (picUrl && !picUrl.startsWith('http')) {
            picUrl = `${STORAGE_BASE}/profile_pics/${picUrl}`;
        }
        profilePic.src = picUrl;
    }

    if (skillsList) {
        if (data.skills?.length > 0) {
            skillsList.innerHTML = "";
            data.skills.forEach(skill => {
                const li = document.createElement("li");
                li.innerHTML = `${skill.skill_name} ${skill.verified ? "<span class='badge verified'>Verified</span>" : ""}`;
                skillsList.appendChild(li);
            });
        } else {
            skillsList.innerHTML = "<li>No skills available</li>";
        }
    }

    // Load projects
    loadCompletedProjects(data.projects);
}

function loadCompletedProjects(projects) {
    const projectsDiv = document.getElementById("projectsList");
    if (!projectsDiv) return;

    if (!projects || projects.length === 0) {
        projectsDiv.innerHTML = `
            <div class="empty-state">
                <h3>No Projects Yet</h3>
                <p>This freelancer has no projects yet.</p>
            </div>
        `;
        return;
    }

    projectsDiv.innerHTML = "<h3>Projects</h3>";
    projects.forEach(project => {
        const isMilestone = project.payment_type === 'milestone';
        const paymentType = isMilestone ? '🎯 Milestone-based' : '💰 Single Payment';

        let progressInfo = '';
        if (isMilestone) {
            progressInfo = `
                <div class="milestone-progress">
                    <strong>Progress:</strong> ${project.progress_info}
                    ${project.milestones?.length ? `
                        <div class="milestones-list">
                            ${project.milestones.map(m => `
                                <div class="milestone-item ${m.status}">
                                    ${m.title} - $${m.amount} 
                                    <span class="status-badge">${m.status}</span>
                                </div>
                            `).join('')}
                        </div>
                    ` : ''}
                </div>
            `;
        } else {
            progressInfo = `<p><strong>Type:</strong> Single payment upon completion</p>`;
        }

        projectsDiv.innerHTML += `
            <div class="project-card">
                <div class="project-header">
                    <h4>${project.job_title || 'Untitled Project'}</h4>
                    <span class="payment-badge">${paymentType}</span>
                </div>
                <p>${project.job_description || 'No description available'}</p>
                <p><strong>Budget:</strong> $${project.budget || 'N/A'}</p>
                <p><strong>Client:</strong> ${project.client_name}</p>
                ${progressInfo}
                <small>Started: ${new Date(project.created_at).toLocaleDateString()}</small>
            </div>
        `;
    });
}

await loadFreelancerProfile();