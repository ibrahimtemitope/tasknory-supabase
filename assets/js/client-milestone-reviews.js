// client-milestone-reviews.js — SUPABASE VERSION
// Uses RPC functions: approve_milestone(p_milestone_id) and reject_milestone(p_milestone_id, p_reason)
// Import the global Supabase client
import { supabase, getCurrentUser, STORAGE_BASE } from './api.js';

document.addEventListener("DOMContentLoaded", loadPendingMilestoneReviews);

async function loadPendingMilestoneReviews() {
    try {
        const user = await getCurrentUser();
        if (!user) return;

        const container = document.getElementById("milestoneReviewsList");
        if (!container) return;

        container.innerHTML = "<div class='loading'>Loading milestone submissions...</div>";

        // Fetch all submitted milestones for this client's jobs
        const { data: milestones, error } = await supabase
            .from('milestone')
            .select(`
                *,
                job:job_id(
                    *,
                    client:client_id(id),
                    hires:hire(
                        id,
                        freelancer:freelancer_id(full_name)
                    )
                ),
                submissions:milestone_submission(*)
            `)
            .eq('status', 'submitted');
        if (error) throw error;

        // Filter to only this client's milestones (RLS may already do this, but double-check)
        const clientMilestones = (milestones || []).filter(m => m.job?.client?.id === user.id);

        if (!clientMilestones || clientMilestones.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <h3>No Pending Milestone Reviews</h3>
                    <p>All milestone submissions have been reviewed.</p>
                </div>
            `;
            updatePendingCount(0);
            return;
        }

        container.innerHTML = '<div class="reviews-grid"></div>';
        const reviewsGrid = container.querySelector('.reviews-grid');

        clientMilestones.forEach((milestone, index) => {
            const job = milestone.job;
            const hire = job?.hires?.[0];
            const freelancerName = hire?.freelancer?.full_name || "Unknown Freelancer";
            const submission = milestone.submissions?.[0];

            const submissionCard = document.createElement("div");
            submissionCard.className = "submission-card";
            submissionCard.style.animationDelay = `${index * 0.1}s`;

            submissionCard.innerHTML = `
                <div class="submission-header">
                    <h3>${escapeHtml(job?.title || 'Untitled')}</h3>
                    <span class="submission-badge">Milestone ${milestone.sequence}</span>
                </div>

                <div class="submission-meta">
                    <div class="meta-item">
                        <span class="meta-label">Freelancer</span>
                        <span class="meta-value">${escapeHtml(freelancerName)}</span>
                    </div>
                    <div class="meta-item">
                        <span class="meta-label">Milestone Amount</span>
                        <span class="meta-value">$${milestone.amount}</span>
                    </div>
                    <div class="meta-item">
                        <span class="meta-label">Submitted</span>
                        <span class="meta-value">${new Date(milestone.submitted_at).toLocaleString()}</span>
                    </div>
                </div>

                <div class="milestone-details">
                    <h4>${escapeHtml(milestone.title)}</h4>
                    <p class="milestone-description">${escapeHtml(milestone.description)}</p>

                    ${submission?.message ? `
                        <div class="submission-message">
                            <strong>Freelancer's Notes:</strong>
                            <p>${escapeHtml(submission.message)}</p>
                        </div>
                    ` : ''}
                </div>

                <div class="submission-actions">
                    <button class="btn btn-primary review-btn" data-milestone-id="${milestone.id}">
                        👁️ Review Submission
                    </button>
                    <button class="btn btn-secondary" onclick="window.location.href='../chat/chat.html?hire=${hire?.id}'">
                        💬 Chat with Freelancer
                    </button>
                </div>
            `;

            reviewsGrid.appendChild(submissionCard);
        });

        updatePendingCount(clientMilestones.length);

        document.querySelectorAll('.review-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const milestoneId = e.target.dataset.milestoneId;
                openReviewModal(milestoneId);
            });
        });

    } catch (error) {
        console.error("Error loading milestone reviews:", error);
        const container = document.getElementById("milestoneReviewsList");
        if (container) container.innerHTML = "<p class='error'>Error loading submissions. Please try again.</p>";
    }
}

function updatePendingCount(count) {
    const el = document.getElementById('pendingCount');
    if (el) el.textContent = count;
}

async function openReviewModal(milestoneId) {
    const modal = document.getElementById('reviewModal');
    const modalTitle = document.getElementById('modalTitle');
    const reviewContent = document.getElementById('reviewContent');
    const approveBtn = document.getElementById('approveBtn');
    const rejectBtn = document.getElementById('rejectBtn');

    if (reviewContent) reviewContent.innerHTML = "<div class='loading'>Loading submission details...</div>";
    if (approveBtn) approveBtn.disabled = true;
    if (rejectBtn) rejectBtn.disabled = true;

    try {
        // Fetch milestone details with all related data
        const { data: milestone, error } = await supabase
            .from('milestone')
            .select(`
                *,
                job:job_id(*, client:client_id(id), hires:hire(id, freelancer:freelancer_id(full_name))),
                submissions:milestone_submission(*)
            `)
            .eq('id', milestoneId)
            .single();
        if (error) throw error;

        const job = milestone.job;
        const hire = job?.hires?.[0];
        const freelancerName = hire?.freelancer?.full_name || "Unknown Freelancer";
        const submission = milestone.submissions?.[0];

        // Build file URL — could be Storage path or full URL
        let fileUrl = milestone.submission_url;
        if (fileUrl && !fileUrl.startsWith('http')) {
            fileUrl = `${STORAGE_BASE}/milestone_submissions/${fileUrl}`;
        }

        if (reviewContent) {
            reviewContent.innerHTML = `
                <div class="review-details">
                    <div class="review-header">
                        <h4>${escapeHtml(job?.title)}</h4>
                        <span class="amount-badge">$${milestone.amount}</span>
                    </div>

                    <div class="review-meta">
                        <p><strong>Freelancer:</strong> ${escapeHtml(freelancerName)}</p>
                        <p><strong>Milestone:</strong> ${milestone.sequence}. ${escapeHtml(milestone.title)}</p>
                        <p><strong>Submitted:</strong> ${new Date(milestone.submitted_at).toLocaleString()}</p>
                    </div>

                    <div class="milestone-info">
                        <h5>Milestone Requirements</h5>
                        <p>${escapeHtml(milestone.description)}</p>
                    </div>

                    ${submission?.message ? `
                        <div class="submission-info">
                            <h5>Freelancer's Submission Notes</h5>
                            <p>${escapeHtml(submission.message)}</p>
                        </div>
                    ` : ''}

                    <div class="submission-files">
                        <h5>Deliverables</h5>
                        ${fileUrl ? `
                            <a href="${fileUrl}" target="_blank" class="download-link">
                                📥 Download Submitted Files (ZIP)
                            </a>
                        ` : '<p>No files submitted.</p>'}
                    </div>
                </div>
            `;
        }

        if (modalTitle) modalTitle.textContent = `Review: ${escapeHtml(milestone.title)}`;
        if (approveBtn) approveBtn.disabled = false;
        if (rejectBtn) rejectBtn.disabled = false;

        // Re-attach event listeners (clone to avoid duplicates)
        const newApproveBtn = approveBtn.cloneNode(true);
        const newRejectBtn = rejectBtn.cloneNode(true);
        approveBtn.parentNode.replaceChild(newApproveBtn, approveBtn);
        rejectBtn.parentNode.replaceChild(newRejectBtn, rejectBtn);

        newApproveBtn.addEventListener('click', () => handleMilestoneDecision(milestone.id, 'approve'));
        newRejectBtn.addEventListener('click', () => handleMilestoneDecision(milestone.id, 'reject'));

        if (modal) modal.style.display = 'block';

    } catch (error) {
        console.error("Error loading review details:", error);
        if (reviewContent) reviewContent.innerHTML = "<p class='error'>Error loading submission details.</p>";
        if (approveBtn) approveBtn.disabled = false;
        if (rejectBtn) rejectBtn.disabled = false;
    }
}

async function handleMilestoneDecision(milestoneId, decision) {
    const approveBtn = document.getElementById('approveBtn');
    const rejectBtn = document.getElementById('rejectBtn');
    if (approveBtn) approveBtn.disabled = true;
    if (rejectBtn) rejectBtn.disabled = true;

    try {
        if (decision === 'approve') {
            if (approveBtn) approveBtn.innerHTML = '✅ Approving...';

            // Call the RPC function
            const { data, error } = await supabase
                .rpc('approve_milestone', { p_milestone_id: milestoneId });
            if (error) throw error;
            if (data && !data.success) {
                throw new Error(data.error || 'Approval failed');
            }

            if (approveBtn) approveBtn.innerHTML = '✅ Approved!';
        } else {
            const reason = prompt("Please provide feedback for the freelancer (what needs to be improved):");
            if (reason === null) {
                if (approveBtn) approveBtn.disabled = false;
                if (rejectBtn) rejectBtn.disabled = false;
                return;
            }
            if (!reason.trim()) {
                alert("Please provide feedback to request revisions.");
                if (approveBtn) approveBtn.disabled = false;
                if (rejectBtn) rejectBtn.disabled = false;
                return;
            }
            if (rejectBtn) rejectBtn.innerHTML = '❌ Rejecting...';

            // Call the RPC function
            const { data, error } = await supabase
                .rpc('reject_milestone', { p_milestone_id: milestoneId, p_reason: reason.trim() });
            if (error) throw error;
            if (data && !data.success) {
                throw new Error(data.error || 'Rejection failed');
            }

            if (rejectBtn) rejectBtn.innerHTML = '❌ Rejected!';
        }
        setTimeout(() => {
            const modal = document.getElementById('reviewModal');
            if (modal) modal.style.display = 'none';
            loadPendingMilestoneReviews();
        }, 1500);
    } catch (error) {
        console.error("Error processing milestone decision:", error);
        alert('Failed to process decision: ' + (error.message || error));
        if (approveBtn) {
            approveBtn.disabled = false;
            approveBtn.innerHTML = '✅ Approve & Release Payment';
        }
        if (rejectBtn) {
            rejectBtn.disabled = false;
            rejectBtn.innerHTML = '❌ Request Revisions';
        }
    }
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}