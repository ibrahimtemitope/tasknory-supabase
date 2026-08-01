// admin/skills.js — SUPABASE VERSION
// Import the global Supabase client
import { supabase, getCurrentUser } from '../api.js';

async function requireAdmin() {
    try {
        const user = await getCurrentUser(false);
        if (!user || user.role !== 'admin') {
            window.location.href = "../client/login.html";
        }
    } catch (error) {
        console.error("Admin check error:", error);
        window.location.href = "../client/login.html";
    }
}

document.addEventListener("DOMContentLoaded", requireAdmin);
document.addEventListener("DOMContentLoaded", () => {
    loadVerifications();
    setupEventListeners();
});

function setupEventListeners() {
    const refreshBtn = document.getElementById('refreshBtn');
    const filterSelect = document.getElementById('filterSelect');
    const closeBtn = document.querySelector('.close-btn');
    const modal = document.getElementById('detailsModal');

    if (refreshBtn) {
        refreshBtn.addEventListener('click', loadVerifications);
    }
    if (filterSelect) {
        filterSelect.addEventListener('change', loadVerifications);
    }
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            modal.style.display = 'none';
        });
    }
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.style.display = 'none';
            }
        });
    }
}

async function loadVerifications() {
    const container = document.getElementById("verificationList");
    const filter = document.getElementById('filterSelect')?.value || 'all';

    container.innerHTML = '<div class="loading">Loading verifications...</div>';

    try {
        let query = supabase
            .from('skill_verification')
            .select(`
                *,
                freelancer_skill:freelancer_skill_id(
                    *,
                    skill:skill_id(skill_name),
                    freelancer:freelancer_id(full_name, email)
                )
            `)
            .order('created_at', { ascending: false });

        if (filter !== 'all') {
            query = query.eq('status', filter);
        }

        const { data, error } = await query;
        if (error) throw error;

        // Update stats
        const allData = await supabase
            .from('skill_verification')
            .select('status');
        const stats = {
            pending: allData.data?.filter(v => v.status === 'pending').length || 0,
            approved: allData.data?.filter(v => v.status === 'approved').length || 0,
            rejected: allData.data?.filter(v => v.status === 'rejected').length || 0,
            total: allData.data?.length || 0
        };
        document.getElementById('pendingCount').textContent = stats.pending;
        document.getElementById('approvedCount').textContent = stats.approved;
        document.getElementById('rejectedCount').textContent = stats.rejected;
        document.getElementById('totalCount').textContent = stats.total;

        const skillsBadge = document.getElementById('skillsBadge');
        if (skillsBadge) skillsBadge.textContent = stats.pending;

        if (!data || data.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <h3>No Verifications Found</h3>
                    <p>There are no skill verifications matching your current filter.</p>
                </div>
            `;
            return;
        }

        renderVerifications(data, container);
    } catch (error) {
        console.error("Error loading verifications:", error);
        container.innerHTML = '<div class="error">Error loading verifications. Please try again.</div>';
    }
}

function renderVerifications(data, container) {
    container.innerHTML = '';
    const template = document.getElementById("verificationCardTemplate");

    data.forEach(v => {
        const clone = template.content.cloneNode(true);

        // Safely extract nested data
        const skillName = v.freelancer_skill?.skill?.skill_name || 'Unknown';
        const freelancerName = v.freelancer_skill?.freelancer?.full_name || 'Unknown';
        const freelancerEmail = v.freelancer_skill?.freelancer?.email || '';
        const years = v.years_experience || '?';

        clone.querySelector(".skill-name").textContent = skillName;
        clone.querySelector(".freelancer-name").textContent = freelancerName;
        clone.querySelector(".years").textContent = years;

        // Set reference link
        const referenceLink = clone.querySelector(".reference-link");
        referenceLink.href = v.reference_link || '#';
        referenceLink.textContent = "View Reference";

        // Set proof link if available
        const proofWrapper = clone.querySelector(".proof-wrapper");
        if (v.proof_url) {
            const proofLink = clone.querySelector(".proof-link");
            proofLink.href = v.proof_url;
            proofLink.textContent = "Download Proof";
        } else {
            proofWrapper.innerHTML = '<span class="label">Proof:</span><span class="value">No proof provided</span>';
        }

        // Status badge
        const statusBadge = clone.querySelector(".status-badge");
        statusBadge.textContent = v.status;
        statusBadge.className = `status-badge ${v.status}`;

        // Add event listeners
        setupCardEventListeners(clone, v);

        container.appendChild(clone);
    });
}

function setupCardEventListeners(card, verification) {
    card.querySelector(".approve-btn").addEventListener("click", async () => {
        if (confirm(`Approve skill verification?`)) {
            await handleVerificationDecision(verification.id, "approve");
        }
    });
    card.querySelector(".reject-btn").addEventListener("click", async () => {
        if (confirm(`Reject skill verification?`)) {
            await handleVerificationDecision(verification.id, "reject");
        }
    });
    card.querySelector(".view-details-btn").addEventListener("click", () => {
        showVerificationDetails(verification);
    });
}

function showVerificationDetails(verification) {
    const modal = document.getElementById("detailsModal");
    const modalBody = document.getElementById("modalBody");

    const skillName = verification.freelancer_skill?.skill?.skill_name || 'Unknown';
    const freelancerName = verification.freelancer_skill?.freelancer?.full_name || 'Unknown';
    const freelancerEmail = verification.freelancer_skill?.freelancer?.email || '';

    modalBody.innerHTML = `
        <div class="modal-details">
            <div class="modal-detail-item">
                <span class="label">Skill:</span>
                <span class="value">${escapeHtml(skillName)}</span>
            </div>
            <div class="modal-detail-item">
                <span class="label">Freelancer:</span>
                <span class="value">${escapeHtml(freelancerName)} ${freelancerEmail ? `(${escapeHtml(freelancerEmail)})` : ''}</span>
            </div>
            <div class="modal-detail-item">
                <span class="label">Years of Experience:</span>
                <span class="value">${verification.years_experience} years</span>
            </div>
            <div class="modal-detail-item">
                <span class="label">Reference Link:</span>
                <span class="value"><a href="${escapeHtml(verification.reference_link)}" target="_blank">${escapeHtml(verification.reference_link)}</a></span>
            </div>
            <div class="modal-detail-item">
                <span class="label">Proof File:</span>
                <span class="value">${verification.proof_url ? `<a href="${escapeHtml(verification.proof_url)}" target="_blank">Download Proof</a>` : 'No proof provided'}</span>
            </div>
            <div class="modal-detail-item">
                <span class="label">Status:</span>
                <span class="value status-badge ${verification.status}">${verification.status}</span>
            </div>
        </div>
    `;

    modal.style.display = "block";
}

async function handleVerificationDecision(verificationId, decision) {
    try {
        const container = document.getElementById("verificationList");
        container.innerHTML = '<div class="loading">Processing...</div>';

        const { data: { user } } = await supabase.auth.getUser();
        const now = new Date().toISOString();

        // 1. Update verification status
        const { error: verifError } = await supabase
            .from('skill_verification')
            .update({
                status: decision === 'approve' ? 'approved' : 'rejected',
                reviewed_by_id: user.id,
                reviewed_at: now
            })
            .eq('id', verificationId);
        if (verifError) throw verifError;

        // 2. If approved, also mark the freelancer_skill as verified
        if (decision === 'approve') {
            const { data: verification } = await supabase
                .from('skill_verification')
                .select('freelancer_skill_id')
                .eq('id', verificationId)
                .single();

            if (verification?.freelancer_skill_id) {
                const { error: skillError } = await supabase
                    .from('freelancer_skill')
                    .update({ verified: true })
                    .eq('id', verification.freelancer_skill_id);
                if (skillError) console.error('Error updating freelancer_skill:', skillError);
            }
        }

        // 3. Notify freelancer
        const { data: verif } = await supabase
            .from('skill_verification')
            .select('freelancer_skill:freelancer_skill_id(freelancer_id)')
            .eq('id', verificationId)
            .single();

        if (verif?.freelancer_skill?.freelancer_id) {
            const msg = decision === 'approve'
                ? 'Your skill has been verified!'
                : 'Your skill verification was rejected. Please resubmit.';
            await supabase.from('notification').insert({
                user_id: verif.freelancer_skill.freelancer_id,
                type: decision === 'approve' ? 'skill_verified' : 'skill_rejected',
                message: msg,
                read: false
            });
        }

        showNotification(`Skill verification ${decision}d successfully!`, "success");
        loadVerifications();
    } catch (err) {
        console.error("Decision error:", err);
        showNotification("Failed to update verification: " + (err.message || err), "error");
        loadVerifications();
    }
}

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
        notification.style.background = "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)";
    } else {
        notification.style.background = "var(--gradient-admin)";
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

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// Add CSS for notifications (already present)
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
`;
document.head.appendChild(style);