// Import the global Supabase client + helpers
import { supabase, getCurrentUser, STORAGE_BASE } from '../api.js';

document.addEventListener("DOMContentLoaded", loadPendingReviews);

async function loadPendingReviews() {
    try {
        const user = await getCurrentUser();
        if (!user) return;

        const container = document.getElementById("pendingReviewsList");
        if (!container) return;

        container.innerHTML = "<div class='loading'>Loading pending reviews...</div>";

        // 1. Fetch all hires for this client
        const { data: hires, error: hiresError } = await supabase
            .from('hire')
            .select(`
                *,
                job:job_id(*),
                freelancer:freelancer_id(*)
            `)
            .eq('client_id', user.id);
        if (hiresError) throw hiresError;

        const hiresMap = {};
        hires.forEach(hire => { hiresMap[hire.id] = hire; });

        // 2. Fetch all final submissions for these hires
        const hireIds = hires.map(h => h.id);
        let latestByHire = {};

        if (hireIds.length > 0) {
            const { data: submissions, error: subError } = await supabase
                .from('final_submission')
                .select('*')
                .in('hire_id', hireIds)
                .order('created_at', { ascending: false });
            if (subError) throw subError;

            // Group by hire_id and keep only the latest submission
            submissions.forEach(sub => {
                const hireId = sub.hire_id;
                if (!latestByHire[hireId]) {
                    latestByHire[hireId] = sub;
                }
            });
        }

        const latestSubmissions = Object.values(latestByHire);

        if (latestSubmissions.length === 0) {
            container.innerHTML = "<p class='empty-state'>No submissions to review.</p>";
            return;
        }

        container.innerHTML = "";
        latestSubmissions.forEach((sub, index) => {
            const hire = hiresMap[sub.hire_id];
            if (!hire) return; // skip if hire not found
            const job = hire.job;

            // Construct file URL
            let fileUrl = sub.file || sub.file_url;
            if (fileUrl && !fileUrl.startsWith('http')) {
                // It's a storage path — for private buckets, we'd need a signed URL
                // For now, assume file_url stores the full signed URL or public URL
                fileUrl = `${STORAGE_BASE}/final_submissions/${fileUrl}`;
            }

            const div = document.createElement("div");
            div.classList.add("submission-card");
            div.style.animationDelay = `${index * 0.1}s`;

            // UI based on status
            let actionsHtml = '';
            let statusHtml = '';

            if (sub.status === 'submitted') {
                statusHtml = `<span class="status-badge">${sub.status}</span>`;
                actionsHtml = `
                    <div class="review-actions">
                        <button class="btn btn-success confirm-btn" data-submission="${sub.id}" data-hire="${hire.id}" data-amount="${job.budget}" data-freelancer="${hire.freelancer_id}">
                            ✅ Approve & Pay
                        </button>
                        <button class="btn btn-danger dispute-btn" data-submission="${sub.id}">
                            ❌ Request Revisions
                        </button>
                    </div>
                `;
            } else if (sub.status === 'rejected') {
                statusHtml = `<span class="status-badge rejected">Rejected – awaiting freelancer resubmission</span>`;
                actionsHtml = `<p class="info-message">Revisions requested. Freelancer will resubmit.</p>`;
            } else if (sub.status === 'approved') {
                statusHtml = `<span class="status-badge approved">Approved & Paid</span>`;
                actionsHtml = `<p class="info-message">This work has been approved and paid.</p>`;
            } else {
                statusHtml = `<span class="status-badge">${sub.status}</span>`;
            }

            div.innerHTML = `
                <h3>${escapeHtml(job.title)}</h3>
                <p><strong>Freelancer:</strong> ${escapeHtml(hire.freelancer?.full_name || 'Unknown')}</p>
                <p><strong>Submitted:</strong> ${new Date(sub.created_at).toLocaleString()}</p>
                <p><strong>Status:</strong> ${statusHtml}</p>
                <p><strong>Payment Amount:</strong> ${Number(job.budget).toFixed(2)} $</p>
                ${fileUrl ? `<p><a href="${fileUrl}" target="_blank">📂 View Final Work</a></p>` : '<p>No file uploaded</p>'}
                ${actionsHtml}
            `;

            container.appendChild(div);
        });

        // Attach event listeners
        document.querySelectorAll(".confirm-btn").forEach(btn => {
            btn.addEventListener("click", (e) => {
                const submissionId = e.target.dataset.submission;
                const hireId = e.target.dataset.hire;
                const amount = e.target.dataset.amount;
                const freelancerId = e.target.dataset.freelancer;
                confirmWork(submissionId, hireId, amount, freelancerId);
            });
        });

        document.querySelectorAll(".dispute-btn").forEach(btn => {
            btn.addEventListener("click", (e) => {
                const submissionId = e.target.dataset.submission;
                requestRevisions(submissionId);
            });
        });

    } catch (error) {
        console.error("Load error:", error);
        const container = document.getElementById("pendingReviewsList");
        if (container) container.innerHTML = `<p class='error'>${error.message || 'Error loading reviews'}</p>`;
    }
}

async function confirmWork(submissionId, hireId, amount, freelancerId) {
    try {
        // Call Edge Function to handle the full approval + payment flow
        // (Cannot do this from frontend because RLS blocks updating freelancer's coin_balance)
        const { data, error } = await supabase.functions.invoke('approve-submission', {
            body: {
                submission_id: submissionId,
                hire_id: hireId,
                amount: parseFloat(amount),
                freelancer_id: freelancerId
            }
        });

        if (error) throw error;
        alert(`✅ Work approved & paid!`);
        loadPendingReviews(); // Refresh
    } catch (error) {
        console.error("Approve & Pay failed:", error);
        alert("Failed to approve and pay: " + (error.message || error));
    }
}

async function requestRevisions(submissionId) {
    const reason = prompt("Please provide feedback for the freelancer (what needs to be improved):");
    if (reason === null) return;
    if (!reason.trim()) {
        alert("Please provide feedback to request revisions.");
        return;
    }

    try {
        const { error } = await supabase
            .from('final_submission')
            .update({
                status: 'rejected',
                rejection_reason: reason.trim()
            })
            .eq('id', submissionId);
        if (error) throw error;

        alert("✅ Revision request sent to freelancer.");
        loadPendingReviews(); // Refresh
    } catch (error) {
        console.error("Request revisions failed:", error);
        alert("Failed to request revisions: " + (error.message || error));
    }
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}