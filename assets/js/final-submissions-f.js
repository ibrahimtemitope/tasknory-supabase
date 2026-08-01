// final-submissions-f.js — SUPABASE VERSION
import { supabase, getCurrentUser, uploadFile } from './api.js';

document.addEventListener("DOMContentLoaded", loadHires);

async function loadHires() {
    try {
        const user = await getCurrentUser();
        if (!user) return;

        const container = document.getElementById("hiresList");
        if (!container) return;

        container.innerHTML = "<div class='loading'>Loading your active hires...</div>";

        // 1. Fetch all hires for this freelancer (single payment only, filtered on frontend)
        const { data: hires, error: hiresError } = await supabase
            .from('hire')
            .select(`
                *,
                job:job_id(*),
                client:client_id(full_name)
            `)
            .eq('freelancer_id', user.id);
        if (hiresError) throw hiresError;

        // 2. Get all final submissions for this freelancer
        const { data: submissions, error: subError } = await supabase
            .from('final_submission')
            .select('*')
            .eq('freelancer_id', user.id);
        if (subError) throw subError;

        // Create maps for easier lookup
        const submissionStatusMap = {};
        const submissionRejectionMap = {};
        const submissionDateMap = {};

        submissions.forEach(sub => {
            submissionStatusMap[sub.hire_id] = sub.status;
            if (sub.rejection_reason) submissionRejectionMap[sub.hire_id] = sub.rejection_reason;
            if (sub.approved_at) submissionDateMap[sub.hire_id] = sub.approved_at;
        });

        // 3. Filter for single payment jobs
        const currentTime = new Date();
        const threeDaysAgo = new Date(currentTime.getTime() - (3 * 24 * 60 * 60 * 1000));

        const visibleHires = hires.filter(hire => {
            if (hire.job.payment_type !== 'single') return false;
            const submissionStatus = submissionStatusMap[hire.id];
            const approvedDate = submissionDateMap[hire.id];
            if (submissionStatus === "approved" && approvedDate) {
                const approvedDateObj = new Date(approvedDate);
                if (approvedDateObj <= threeDaysAgo) return false;
            }
            return true;
        });

        if (visibleHires.length === 0) {
            container.innerHTML = `
                <div class="empty-hires">
                    <h3>No Active Single Payment Jobs</h3>
                    <p>You don't have any active single payment hires at the moment.</p>
                    <p>Check your milestones page for milestone-based projects.</p>
                </div>
            `;
            return;
        }

        const pendingCountEl = document.getElementById('pendingCount');
        if (pendingCountEl) pendingCountEl.textContent = visibleHires.length;

        container.innerHTML = '<div class="hires-grid"></div>';
        const hiresGrid = container.querySelector('.hires-grid');

        visibleHires.forEach((hire, index) => {
            const submissionStatus = submissionStatusMap[hire.id];
            const rejectionReason = submissionRejectionMap[hire.id];
            const approvedDate = submissionDateMap[hire.id];

            const hireCard = document.createElement("div");
            hireCard.className = "hire-card";
            hireCard.style.animationDelay = `${index * 0.1}s`;

            // Get expected outcome from job, fallback to description if not present
            const expectedOutcome = hire.job.expected_outcome || hire.job.description || 'No description provided';

            let statusHTML = '';
            let actionsHTML = '';
            let descriptionHTML = '';

            if (submissionStatus === "approved") {
                const approvedDateObj = new Date(approvedDate);
                const daysSinceApproval = Math.floor((currentTime - approvedDateObj) / (1000 * 60 * 60 * 24));
                const daysLeft = Math.max(0, 3 - daysSinceApproval);

                statusHTML = `
                    <div class="submission-status approved">
                        <span class="status-badge approved">✅ Approved & Paid</span>
                        <p class="completion-message">🎉 Project completed successfully!</p>
                        <small>Approved on: ${approvedDateObj.toLocaleDateString()}</small>
                        ${daysLeft > 0 ?
                            `<small class="archive-warning">This project will be archived in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}</small>` :
                            `<small class="archive-warning">This project will be archived today</small>`
                        }
                    </div>
                `;
                descriptionHTML = `
                    <div class="hire-description">
                        <p><strong>Job Completed:</strong> ${hire.job.description}</p>
                    </div>
                `;
                actionsHTML = `
                    <div class="hire-actions">
                        <button class="btn-completed" disabled>✅ Project Completed</button>
                    </div>
                `;
            } else if (submissionStatus === "rejected") {
                statusHTML = `
                    <div class="submission-status rejected">
                        <span class="status-badge rejected">❌ Revision Requested</span>
                        <div class="rejection-reason">
                            <strong>Client Feedback:</strong>
                            <p>${rejectionReason || 'No specific feedback provided.'}</p>
                        </div>
                    </div>
                `;
                descriptionHTML = `
                    <div class="hire-description">
                        <strong>Expected Outcome:</strong> ${expectedOutcome}
                    </div>
                `;
                actionsHTML = `
                    <div class="hire-actions">
                        <button class="btn-submit-final" data-id="${hire.id}">📤 Resubmit Final Project</button>
                    </div>
                    <div class="final-form" id="form-${hire.id}">
                        <p>Please address the client's feedback and upload your revised project.</p>
                        <div class="file-upload-wrapper">
                            <div class="file-input-wrapper">
                                <input type="file" id="file-${hire.id}" accept=".zip" />
                            </div>
                            <button class="btn-upload-final" data-id="${hire.id}">🚀 Upload Revised Project</button>
                        </div>
                    </div>
                `;
            } else if (submissionStatus === "submitted") {
                statusHTML = `
                    <div class="submission-status submitted">
                        <span class="status-badge submitted">📤 Submitted for Review</span>
                        <p class="waiting-message">⏳ Waiting for client approval...</p>
                    </div>
                `;
                descriptionHTML = `
                    <div class="hire-description">
                        <strong>Expected Outcome:</strong> ${expectedOutcome}
                    </div>
                `;
                actionsHTML = `
                    <div class="hire-actions">
                        <button class="btn-submitted" disabled>📤 Awaiting Client Review</button>
                    </div>
                `;
            } else {
                statusHTML = `
                    <div class="submission-status pending">
                        <span class="status-badge pending">📝 Ready for Submission</span>
                    </div>
                `;
                descriptionHTML = `
                    <div class="hire-description">
                        <strong>Expected Outcome:</strong> ${expectedOutcome}
                    </div>
                `;
                actionsHTML = `
                    <div class="hire-actions">
                        <button class="btn-submit-final" data-id="${hire.id}">📤 Submit Final Project</button>
                    </div>
                    <div class="final-form" id="form-${hire.id}">
                        <p>Upload your completed project in ZIP format for client review.</p>
                        <div class="file-upload-wrapper">
                            <div class="file-input-wrapper">
                                <input type="file" id="file-${hire.id}" accept=".zip" />
                            </div>
                            <button class="btn-upload-final" data-id="${hire.id}">🚀 Upload Final Project</button>
                        </div>
                    </div>
                `;
            }

            hireCard.innerHTML = `
                <div class="hire-header">
                    <h3 class="hire-title">${hire.job.title}</h3>
                    <span class="payment-badge single-badge">💳 Single Payment</span>
                </div>
                <div class="hire-client">
                    <strong>Client:</strong> ${hire.client?.full_name || 'Unknown'}
                </div>
                ${statusHTML}
                ${descriptionHTML}
                ${actionsHTML}
                <div class="hire-meta">
                    <span class="hire-date">Hired: ${new Date(hire.created_at).toLocaleDateString()}</span>
                    <span class="hire-id">#${hire.id.substring(0, 8)}</span>
                </div>
            `;

            hiresGrid.appendChild(hireCard);
        });

        // Show form toggle
        document.querySelectorAll(".btn-submit-final").forEach(btn => {
            btn.addEventListener("click", (e) => {
                const hireId = e.target.dataset.id;
                const form = document.getElementById(`form-${hireId}`);
                form.classList.toggle("active");
                e.target.innerHTML = form.classList.contains("active") ?
                    "📋 Hide Submission Form" :
                    (submissionStatusMap[hireId] === "rejected" ? "📤 Resubmit Final Project" : "📤 Submit Final Project");
            });
        });

        // Handle uploads
        document.querySelectorAll(".btn-upload-final").forEach(btn => {
            btn.addEventListener("click", async (e) => {
                const hireId = e.target.dataset.id;
                const fileInput = document.getElementById(`file-${hireId}`);
                const file = fileInput.files[0];
                if (!file) {
                    alert("Please select a ZIP file before uploading.");
                    return;
                }
                if (!file.name.toLowerCase().endsWith('.zip')) {
                    alert("Please upload a ZIP file only.");
                    return;
                }
                await submitFinal(hireId, file);
            });
        });

    } catch (error) {
        console.error("Error loading hires:", error);
        const container = document.getElementById("hiresList");
        if (container) container.innerHTML = "<p class='error'>Error loading hires. Please try again.</p>";
    }
}

async function submitFinal(hireId, file) {
    const button = document.querySelector(`.btn-upload-final[data-id="${hireId}"]`);
    const originalText = button.innerHTML;
    button.innerHTML = '📤 Uploading...';
    button.disabled = true;

    try {
        const user = await getCurrentUser();
        if (!user) throw new Error('Not authenticated');

        // 1. Get hire details to know client_id
        const { data: hire, error: hireError } = await supabase
            .from('hire')
            .select('client_id, job:job_id(title)')
            .eq('id', hireId)
            .single();
        if (hireError || !hire) throw new Error('Hire not found');

        // 2. Upload file to Supabase Storage
        const filePath = `${user.id}/${hireId}/${Date.now()}_${file.name}`;
        const fileUrl = await uploadFile('final_submissions', filePath, file);

        // 3. Check if submission already exists
        const { data: existingSub, error: existingError } = await supabase
            .from('final_submission')
            .select('id')
            .eq('hire_id', hireId)
            .eq('freelancer_id', user.id)
            .maybeSingle();

        if (existingSub) {
            // Update existing submission
            const { error: updateError } = await supabase
                .from('final_submission')
                .update({
                    file_url: fileUrl,
                    file: filePath,
                    status: 'submitted',
                    rejection_reason: '',
                    created_at: new Date().toISOString()
                })
                .eq('id', existingSub.id);
            if (updateError) throw updateError;
        } else {
            // Create new submission
            const { error: insertError } = await supabase
                .from('final_submission')
                .insert({
                    hire_id: hireId,
                    freelancer_id: user.id,
                    client_id: hire.client_id,
                    file_url: fileUrl,
                    file: filePath,
                    status: 'submitted'
                });
            if (insertError) throw insertError;
        }

        button.innerHTML = '✅ Submitted!';
        setTimeout(() => window.location.reload(), 1500);
    } catch (error) {
        console.error(error);
        alert("Failed to submit final project: " + (error.message || error));
        button.innerHTML = originalText;
        button.disabled = false;
    }
}

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