// freelancer-milestones.js — SUPABASE VERSION
import { supabase, getCurrentUser, uploadFile } from './api.js';

document.addEventListener("DOMContentLoaded", loadMilestoneProjects);

async function loadMilestoneProjects() {
    try {
        const user = await getCurrentUser();
        if (!user) return;

        const container = document.getElementById("milestonesList");
        if (!container) return;

        container.innerHTML = "<div class='loading'>Loading your milestone projects...</div>";

        // 1. Fetch all milestone-based hires for this freelancer
        const { data: hires, error: hiresError } = await supabase
            .from('hire')
            .select(`
                *,
                job:job_id(*),
                client:client_id(full_name)
            `)
            .eq('freelancer_id', user.id);
        if (hiresError) throw hiresError;

        // Filter for milestone jobs
        const milestoneHires = hires.filter(hire => hire.job.payment_type === 'milestone');

        if (!milestoneHires || milestoneHires.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <h3>No Milestone Projects</h3>
                    <p>You don't have any milestone-based projects at the moment.</p>
                </div>
            `;
            updateCounts(0, 0);
            return;
        }

        // 2. Fetch milestones for all these jobs
        const jobIds = milestoneHires.map(h => h.job.id);
        const { data: milestones, error: msError } = await supabase
            .from('milestone')
            .select('*')
            .in('job_id', jobIds)
            .order('sequence', { ascending: true });
        if (msError) throw msError;

        // Group milestones by job_id
        const milestonesByJob = {};
        milestones.forEach(m => {
            const jobId = m.job_id;
            if (!milestonesByJob[jobId]) milestonesByJob[jobId] = [];
            milestonesByJob[jobId].push(m);
        });

        // 3. Render projects
        container.innerHTML = '<div class="projects-grid"></div>';
        const projectsGrid = container.querySelector('.projects-grid');

        let pendingCount = 0;
        let completedCount = 0;

        milestoneHires.forEach(hire => {
            const job = hire.job;
            const jobMilestones = milestonesByJob[job.id] || [];
            const pendingMilestones = jobMilestones.filter(m => m.status === 'pending');
            const submittedMilestones = jobMilestones.filter(m => m.status === 'submitted');
            const approvedMilestones = jobMilestones.filter(m => m.status === 'approved');

            pendingCount += pendingMilestones.length;
            completedCount += approvedMilestones.length;

            const projectCard = document.createElement("div");
            projectCard.className = "project-card";

            projectCard.innerHTML = `
                <div class="project-header">
                    <h3>${escapeHtml(job.title)}</h3>
                    <span class="project-badge milestone-badge">💰 Milestone Project</span>
                </div>
                <div class="project-description">${escapeHtml(job.description)}</div>
                <div class="project-meta">
                    <div class="meta-item">
                        <span class="meta-label">Client</span>
                        <span class="meta-value">${escapeHtml(hire.client?.full_name || 'Unknown')}</span>
                    </div>
                    <div class="meta-item">
                        <span class="meta-label">Total Budget</span>
                        <span class="meta-value">$${job.budget}</span>
                    </div>
                    <div class="meta-item">
                        <span class="meta-label">Hired On</span>
                        <span class="meta-value">${new Date(hire.created_at).toLocaleDateString()}</span>
                    </div>
                </div>
                <div class="milestones-progress">
                    <div class="progress-header">
                        <h4>Project Milestones</h4>
                        <span class="progress-stats">${approvedMilestones.length}/${jobMilestones.length} Completed</span>
                    </div>
                    <div class="milestones-list">
                        ${renderMilestonesList(jobMilestones, hire.id, job.id)}
                    </div>
                </div>
            `;

            projectsGrid.appendChild(projectCard);
        });

        updateCounts(pendingCount, completedCount);

        // Attach event listeners to submit buttons
        document.querySelectorAll('.submit-milestone-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const milestoneId = e.target.dataset.milestoneId;
                const hireId = e.target.dataset.hireId;
                const jobId = e.target.dataset.jobId;
                openSubmissionModal(milestoneId, hireId, jobId);
            });
        });

    } catch (error) {
        console.error("Error loading milestone projects:", error);
        const container = document.getElementById("milestonesList");
        if (container) container.innerHTML = "<p class='error'>Error loading projects. Please try again.</p>";
    }
}

function renderMilestonesList(milestones, hireId, jobId) {
    if (!milestones || milestones.length === 0) {
        return '<p class="no-milestones">No milestones defined for this project.</p>';
    }

    return milestones.map(milestone => {
        const statusClass = getStatusClass(milestone.status);
        const statusIcon = getStatusIcon(milestone.status);
        const amountDisplay = `$${milestone.amount || 0}`;

        let actionButton = '';
        if (milestone.status === 'pending' || milestone.status === 'rejected') {
            actionButton = `
                <button class="submit-milestone-btn" 
                        data-milestone-id="${milestone.id}" 
                        data-hire-id="${hireId}"
                        data-job-id="${jobId}">
                    ${milestone.status === 'rejected' ? '🔄 Resubmit Work' : '📤 Submit Work'}
                </button>
            `;
        } else if (milestone.status === 'submitted') {
            actionButton = '<span class="status-badge submitted">⏳ Awaiting Approval</span>';
        } else if (milestone.status === 'approved') {
            actionButton = '<span class="status-badge approved">✅ Approved & Paid</span>';
        }

        const rejectionInfo = milestone.status === 'rejected' && milestone.rejection_reason ? `
            <div class="rejection-info">
                <strong>Client Feedback:</strong>
                <p>${escapeHtml(milestone.rejection_reason)}</p>
            </div>
        ` : '';

        return `
            <div class="milestone-item ${statusClass}">
                <div class="milestone-info">
                    <div class="milestone-header">
                        <h5>${milestone.sequence}. ${escapeHtml(milestone.title || 'Untitled Milestone')}</h5>
                        <span class="milestone-amount">${amountDisplay}</span>
                    </div>
                    <p class="milestone-description">${escapeHtml(milestone.description || 'No description available')}</p>
                    ${rejectionInfo}
                    <div class="milestone-status">
                        <span class="status-icon">${statusIcon}</span>
                        <span class="status-text">${getStatusText(milestone.status)}</span>
                        ${milestone.submitted_at ? `
                            <span class="submission-date">Submitted: ${new Date(milestone.submitted_at).toLocaleDateString()}</span>
                        ` : ''}
                        ${milestone.approved_at && milestone.status === 'approved' ? `
                            <span class="approval-date">Approved: ${new Date(milestone.approved_at).toLocaleDateString()}</span>
                        ` : ''}
                    </div>
                </div>
                <div class="milestone-actions">
                    ${actionButton}
                </div>
            </div>
        `;
    }).join('');
}

function getStatusClass(status) {
    const classes = { pending: 'status-pending', submitted: 'status-submitted', approved: 'status-approved', rejected: 'status-rejected' };
    return classes[status] || 'status-pending';
}

function getStatusIcon(status) {
    const icons = { pending: '⏳', submitted: '📤', approved: '✅', rejected: '❌' };
    return icons[status] || '⏳';
}

function getStatusText(status) {
    const texts = {
        pending: 'Ready to Start',
        submitted: 'Submitted for Review',
        approved: 'Approved & Completed',
        rejected: 'Revisions Requested'
    };
    return texts[status] || 'Pending';
}

function updateCounts(pending, completed) {
    const pendingEl = document.getElementById('pendingCount');
    const completedEl = document.getElementById('completedCount');
    if (pendingEl) pendingEl.textContent = pending;
    if (completedEl) completedEl.textContent = completed;
}

// Modal Functions
function openSubmissionModal(milestoneId, hireId, jobId) {
    const modal = document.getElementById('submissionModal');
    const modalTitle = document.getElementById('modalTitle');
    const milestoneIdInput = document.getElementById('currentMilestoneId');

    if (milestoneIdInput) {
        milestoneIdInput.value = milestoneId;
        milestoneIdInput.dataset.hireId = hireId;
        milestoneIdInput.dataset.jobId = jobId;
    }
    if (modalTitle) modalTitle.textContent = 'Submit Milestone Deliverables';
    const form = document.getElementById('submissionForm');
    if (form) form.reset();
    if (modal) modal.style.display = 'block';
}

const submissionForm = document.getElementById('submissionForm');
if (submissionForm) {
    submissionForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const milestoneId = document.getElementById('currentMilestoneId').value;
        const hireId = document.getElementById('currentMilestoneId').dataset.hireId;
        const jobId = document.getElementById('currentMilestoneId').dataset.jobId;
        const message = document.getElementById('submissionMessage').value;
        const fileInput = document.getElementById('submissionFile');
        const file = fileInput.files[0];

        if (!file) {
            alert('Please select a ZIP file to upload.');
            return;
        }
        if (!file.name.toLowerCase().endsWith('.zip')) {
            alert('Please upload a ZIP file only.');
            return;
        }

        await submitMilestone(milestoneId, hireId, jobId, message, file);
    });
}

async function submitMilestone(milestoneId, hireId, jobId, message, file) {
    const submitBtn = document.getElementById('submitMilestoneBtn');
    const originalText = submitBtn ? submitBtn.innerHTML : 'Submit';

    if (submitBtn) {
        submitBtn.innerHTML = '📤 Uploading...';
        submitBtn.disabled = true;
    }

    try {
        const user = await getCurrentUser();
        if (!user) throw new Error('Not authenticated');

        // 1. Upload file to Supabase Storage
        const filePath = `${user.id}/${milestoneId}/${Date.now()}_${file.name}`;
        const fileUrl = await uploadFile('milestone_submissions', filePath, file);

        // 2. Create milestone submission record
        const { error: subError } = await supabase
            .from('milestone_submission')
            .insert({
                milestone_id: milestoneId,
                freelancer_id: user.id,
                file_url: fileUrl,
                file: filePath,
                message: message || ''
            });
        if (subError) throw subError;

        // 3. Update milestone status to 'submitted'
        const { error: msUpdateError } = await supabase
            .from('milestone')
            .update({
                status: 'submitted',
                submitted_at: new Date().toISOString(),
                submission_url: fileUrl
            })
            .eq('id', milestoneId);
        if (msUpdateError) throw msUpdateError;

        if (submitBtn) submitBtn.innerHTML = '✅ Submitted!';
        setTimeout(() => {
            const modal = document.getElementById('submissionModal');
            if (modal) modal.style.display = 'none';
            loadMilestoneProjects(); // Refresh
        }, 1500);

    } catch (error) {
        console.error('Submission error:', error);
        alert('Failed to submit milestone: ' + (error.message || error));
        if (submitBtn) {
            submitBtn.innerHTML = originalText;
            submitBtn.disabled = false;
        }
    }
}

// Helper: escape HTML
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Theme toggle
function initThemeToggle() {
    const themeToggle = document.getElementById('themeToggle');
    if (!themeToggle) return;
    const themeIcon = themeToggle.querySelector('.theme-icon');
    const themeLabel = themeToggle.querySelector('.theme-label');
    const savedTheme = localStorage.getItem('theme');
    const prefersLight = window.matchMedia('(prefers-color-scheme: light)').matches;

    if (savedTheme === 'light' || (!savedTheme && prefersLight)) {
        document.documentElement.setAttribute('data-theme', 'light');
        themeIcon.textContent = '🌙';
        themeLabel.textContent = 'Dark Mode';
    } else {
        document.documentElement.setAttribute('data-theme', 'dark');
        themeIcon.textContent = '☀️';
        themeLabel.textContent = 'Light Mode';
    }

    themeToggle.addEventListener('click', () => {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        if (currentTheme === 'light') {
            document.documentElement.setAttribute('data-theme', 'dark');
            themeIcon.textContent = '☀️';
            themeLabel.textContent = 'Light Mode';
            localStorage.setItem('theme', 'dark');
        } else {
            document.documentElement.setAttribute('data-theme', 'light');
            themeIcon.textContent = '🌙';
            themeLabel.textContent = 'Dark Mode';
            localStorage.setItem('theme', 'light');
        }
    });
}

document.addEventListener('DOMContentLoaded', initThemeToggle);