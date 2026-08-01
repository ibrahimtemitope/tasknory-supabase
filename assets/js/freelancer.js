import { supabase, getCurrentUser } from './api.js';

// Helper: get current user from Supabase Auth + public.users profile
let currentUser = null;

// Toggle availability
async function toggleAvailability() {
    const user = await getCurrentUser();
    if (!user) return;
    try {
        const newStatus = !user.available;
        const { error } = await supabase
            .from('users')
            .update({ available: newStatus })
            .eq('id', user.id);
        if (error) throw error;

        // Update cached user
        currentUser.available = newStatus;
        // Update toggle directly without reloading the page
        const toggle = document.getElementById("availabilityToggle");
        if (toggle) toggle.checked = newStatus;
    } catch (error) {
        console.error('Failed to update availability:', error);
        alert('Failed to change availability.');
    }
}

// Load availability status (set toggle)
async function loadAvailability() {
    const user = await getCurrentUser();
    if (!user) return;
    const toggle = document.getElementById("availabilityToggle");
    if (toggle) {
        toggle.checked = user.available;
        // Disable if not ID verified
        toggle.disabled = !user.id_verified;
        if (!user.id_verified) {
            toggle.title = "Complete ID verification to toggle availability";
        }
    }
}

// Load matched jobs (with offer system)
async function loadMatchedJobs() {
    const user = await getCurrentUser();
    if (!user) return;
    const container = document.getElementById("matchedJobs");
    if (!container) return;

    container.innerHTML = '<div class="loading">Loading matched jobs...</div>';

    try {
        // Fetch matches for current freelancer
        const { data: matches, error } = await supabase
            .from('job_match')
            .select(`
                *,
                job:job_id(
                    *,
                    client:client_id(full_name)
                )
            `)
            .eq('freelancer_id', user.id);
        if (error) throw error;

        container.innerHTML = '<div class="jobs-grid"></div>';
        const jobsGrid = container.querySelector(".jobs-grid");

        if (!matches || matches.length === 0) {
            jobsGrid.innerHTML = `<div class="empty-jobs"><h3>No Active Job Matches</h3><p>All your matched jobs are either completed or awaiting new openings.</p></div>`;
            return;
        }

        matches.forEach((match, index) => {
            const job = match.job;
            const paymentTypeBadge = job.payment_type === 'milestone' 
                ? '<span class="badge milestone-badge">💰 Milestone Payments</span>'
                : '<span class="badge single-badge">💳 Single Payment</span>';

            const budgetDisplay = job.payment_type === 'milestone' 
                ? `<div class="meta-item"><span class="meta-label">Total Budget</span><span class="meta-value">$${job.budget}</span></div>`
                : `<div class="meta-item"><span class="meta-label">Budget</span><span class="meta-value">$${job.budget}</span></div>`;

            let offerSection = '';
            let statusSection = '';

            switch(match.offer_status) {
                case 'sent':
                    offerSection = `
                        <div class="offer-alert">
                            <div class="offer-header">
                                <span class="offer-badge">🎯 Hire Request Received</span>
                                <small>Received ${match.offer_sent_at ? new Date(match.offer_sent_at).toLocaleDateString() : 'Recently'}</small>
                            </div>
                            <div class="offer-actions">
                                <button class="btn-accept" data-match-id="${match.id}">✅ Accept Offer</button>
                                <button class="btn-reject" data-match-id="${match.id}">❌ Decline</button>
                            </div>
                        </div>
                    `;
                    statusSection = `
                        <div class="job-status">
                            <span class="status-icon">📬</span>
                            <div>
                                <div class="status-text">Hire Request Pending Your Response</div>
                                <div class="status-note">Client is waiting for your decision</div>
                            </div>
                        </div>
                    `;
                    break;
                case 'accepted':
                    offerSection = `
                        <div class="offer-alert accepted">
                            <span class="offer-badge">✅ Offer Accepted</span>
                            <small>Awaiting client to finalize hire</small>
                        </div>
                    `;
                    statusSection = `
                        <div class="job-status">
                            <span class="status-icon">✅</span>
                            <div>
                                <div class="status-text">You've Accepted the Offer!</div>
                                <div class="status-note">Waiting for client to complete hiring</div>
                            </div>
                        </div>
                    `;
                    break;
                case 'rejected':
                    return; // skip
                default:
                    statusSection = `
                        <div class="job-status">
                            <span class="status-icon">✅</span>
                            <div>
                                <div class="status-text">You've Been Matched!</div>
                                <div class="status-note">Waiting for client to send hire request</div>
                            </div>
                        </div>
                    `;
            }

            const jobCard = document.createElement("div");
            jobCard.className = "job-card";
            jobCard.style.animationDelay = `${index * 0.1}s`;

            jobCard.innerHTML = `
                <div class="job-header">
                    <h3 class="job-title">${job.title}</h3>
                    <span class="match-badge">${Math.round(match.score)}% Match</span>
                </div>
                <div class="job-description collapsed">${job.description}</div>
                <button class="expand-toggle" onclick="toggleDescription(this)">
                    <span class="icon">▼</span>
                    <span class="label">Show more</span>
                </button>
                ${job.expected_outcome ? `
                    <div class="expected-outcome-section">
                        <h4>Expected Outcome</h4>
                        <div class="expected-outcome-content collapsed">${job.expected_outcome}</div>
                        <button class="expand-toggle" onclick="toggleOutcome(this)">
                            <span class="icon">▼</span>
                            <span class="label">Show more</span>
                        </button>
                    </div>
                ` : ''}
                ${paymentTypeBadge}
                <div class="job-meta">
                    <div class="meta-item">
                        <span class="meta-label">Posted</span>
                        <span class="meta-value">${new Date(job.created_at).toLocaleDateString()}</span>
                    </div>
                    ${budgetDisplay}
                    <div class="meta-item">
                        <span class="meta-label">Client</span>
                        <span class="meta-value">${job.client?.full_name || 'Unknown'}</span>
                    </div>
                </div>
                ${offerSection}
                ${statusSection}
            `;

            jobsGrid.appendChild(jobCard);
        });

        // Attach event listeners for accept/reject
        document.querySelectorAll(".btn-accept").forEach(btn => {
            btn.addEventListener("click", (e) => {
                const matchId = e.target.dataset.matchId;
                respondToOffer(matchId, true);
            });
        });
        document.querySelectorAll(".btn-reject").forEach(btn => {
            btn.addEventListener("click", (e) => {
                const matchId = e.target.dataset.matchId;
                respondToOffer(matchId, false);
            });
        });

    } catch (error) {
        console.error('Error loading matched jobs:', error);
        container.innerHTML = '<p class="error">Error loading matched jobs.</p>';
    }
}

async function respondToOffer(matchId, accepted) {
    try {
        const { error } = await supabase
            .from('job_match')
            .update({
                offer_status: accepted ? 'accepted' : 'rejected',
                offer_responded_at: new Date().toISOString()
            })
            .eq('id', matchId);
        if (error) throw error;

        alert(`Offer ${accepted ? 'accepted' : 'declined'}!`);
        loadMatchedJobs(); // refresh
    } catch (error) {
        console.error('Error responding to offer:', error);
        alert('Failed to respond to offer.');
    }
}

// Load hires (projects) with deadline and payment info
async function loadHires() {
    const user = await getCurrentUser();
    if (!user) return;
    const hiresList = document.getElementById("hiresList");
    if (!hiresList) return;

    try {
        // 1. Fetch all hires for this freelancer
        const { data: hires, error: hiresError } = await supabase
            .from('hire')
            .select(`
                *,
                job:job_id(*),
                client:client_id(full_name)
            `)
            .eq('freelancer_id', user.id);
        if (hiresError) throw hiresError;

        // 2. Fetch final submissions (to know approved single payments)
        const { data: submissions, error: subError } = await supabase
            .from('final_submission')
            .select('*')
            .eq('freelancer_id', user.id);
        if (subError) throw subError;
        const approvedHires = new Set();
        submissions.forEach(sub => {
            if (sub.status === 'approved') approvedHires.add(sub.hire_id);
        });

        // Build a map of hire -> submission status from fetched submissions
        const submissionStatusMap = {};
        submissions.forEach(sub => {
            submissionStatusMap[sub.hire_id] = sub.status;
        });

        // 3. Identify all milestone jobs and fetch their milestones
        const milestoneJobIds = hires
            .filter(h => h.job.payment_type === 'milestone')
            .map(h => h.job.id);

        let milestonesByJob = {};
        if (milestoneJobIds.length > 0) {
            const { data: milestones, error: msError } = await supabase
                .from('milestone')
                .select('*')
                .in('job_id', milestoneJobIds);
            if (msError) throw msError;
            milestones.forEach(m => {
                const jobId = m.job_id;
                if (!milestonesByJob[jobId]) milestonesByJob[jobId] = [];
                milestonesByJob[jobId].push(m);
            });
        }

        // 4. Filter out completed projects
        const filteredHires = hires.filter(hire => {
            if (hire.job.payment_type === 'single') {
                return !approvedHires.has(hire.id);
            } else if (hire.job.payment_type === 'milestone') {
                const jobMilestones = milestonesByJob[hire.job.id] || [];
                if (jobMilestones.length === 0) return true;
                const allApproved = jobMilestones.every(m => m.status === 'approved');
                return !allApproved;
            }
            return true;
        });

        if (filteredHires.length === 0) {
            hiresList.innerHTML = "<p>No active jobs. All projects have been completed!</p>";
            return;
        }

        // 5. Render the filtered hires
        hiresList.innerHTML = '';

        const getDeadlineSectionClass = (daysDiff) => {
            if (daysDiff > 5) return 'green';
            if (daysDiff > 0 && daysDiff <= 5) return 'yellow';
            if (daysDiff === 0) return 'orange';
            return 'red';
        };
        const getProgressBarClass = (daysDiff) => {
            if (daysDiff > 5) return 'progress-green';
            if (daysDiff > 0 && daysDiff <= 5) return 'progress-yellow';
            if (daysDiff === 0) return 'progress-orange';
            return 'progress-red';
        };
        const getDaysText = (daysDiff) => {
            if (daysDiff > 5) return `${daysDiff} days remaining`;
            if (daysDiff > 0 && daysDiff <= 5) return `${daysDiff} days left`;
            if (daysDiff === 0) return 'Due today';
            return `${Math.abs(daysDiff)} days overdue`;
        };
        const calculateProgressWidth = (daysDiff, deadlineDate) => {
            if (!deadlineDate || daysDiff < 0) return 100;
            const totalDuration = 14;
            const daysPassed = totalDuration - daysDiff;
            const progress = (daysPassed / totalDuration) * 100;
            return Math.min(Math.max(progress, 0), 100);
        };
        const getDeadlineHighlight = (daysDiff) => {
            if (daysDiff > 5) return `<span class="badge badge-green">🟢 ${daysDiff} days remaining</span>`;
            if (daysDiff > 0 && daysDiff <= 5) return `<span class="badge badge-yellow">🟡 ${daysDiff} days left — getting close!</span>`;
            if (daysDiff === 0) return `<span class="badge badge-orange">🟠 Deadline is today!</span>`;
            return `<span class="badge badge-red">🔴 Overdue by ${Math.abs(daysDiff)} day${Math.abs(daysDiff) > 1 ? "s" : ""}</span>`;
        };

        for (const hire of filteredHires) {
            const job = hire.job;
            const deadlineDate = job.deadline ? new Date(job.deadline) : null;
            const now = new Date();
            let daysDiff = null;
            if (deadlineDate) {
                daysDiff = Math.ceil((deadlineDate - now) / (1000 * 60 * 60 * 24));
            }

            // Build payment info
            let paymentTypeInfo = '';
            if (job.payment_type === 'milestone') {
                const jobMilestones = milestonesByJob[job.id] || [];
                const approvedCount = jobMilestones.filter(m => m.status === 'approved').length;
                const totalCount = jobMilestones.length;
                const totalEarned = jobMilestones
                    .filter(m => m.status === 'approved')
                    .reduce((sum, m) => sum + parseFloat(m.amount), 0);
                const totalBudget = job.budget;
                paymentTypeInfo = `
                    <div class="payment-info">
                        <span class="badge milestone-badge">💰 Milestone-based Project</span>
                        <small>Progress: ${approvedCount}/${totalCount} milestones • Earned: $${totalEarned} of $${totalBudget}</small>
                    </div>
                `;
            } else {
                const subStatus = submissionStatusMap[hire.id];
                let statusText = '';
                if (subStatus === 'approved') statusText = '✅ Paid';
                else if (subStatus === 'submitted') statusText = '📤 Under Review';
                else statusText = '📝 Work in Progress';

                paymentTypeInfo = `
                    <div class="payment-info">
                        <span class="badge single-badge">💳 Single Payment</span>
                        <small>Budget: $${job.budget} • Status: ${statusText}</small>
                    </div>
                `;
            }

            const deadlineHighlight = daysDiff !== null ? getDeadlineHighlight(daysDiff) : '';

            const card = document.createElement("div");
            card.className = "card";
            card.innerHTML = `
                <h3>${job.title}</h3>
                <p>${job.description}</p>
                ${paymentTypeInfo}
                ${deadlineDate ? `
                    <div class="deadline-section ${getDeadlineSectionClass(daysDiff)}">
                        <div class="deadline-info">
                            <span class="deadline-date">📅 ${deadlineDate.toLocaleDateString()}</span>
                            <span class="deadline-days">${getDaysText(daysDiff)}</span>
                        </div>
                        ${deadlineHighlight}
                        <div class="deadline-progress">
                            <div class="progress-bar ${getProgressBarClass(daysDiff)}" style="width: ${calculateProgressWidth(daysDiff, deadlineDate)}%"></div>
                        </div>
                    </div>
                ` : `<div class="deadline-section"><span class="badge">No deadline set</span></div>`}
                <p><b>Client:</b> ${hire.client?.full_name || 'Unknown'}</p>
                <small>Hired on ${new Date(hire.created_at).toLocaleString()}</small>
                <div class="card-actions">
                    <button onclick="window.location.href='../chat/chat.html?hire=${hire.id}'">💬 Chat with Client</button>
                    ${job.payment_type === 'milestone' ? `
                        <button onclick="window.location.href='milestones.html?hire=${hire.id}'">📋 Manage Milestones</button>
                    ` : `
                        <button onclick="window.location.href='final-submissions.html?hire=${hire.id}'">🚀 Submit Final Work</button>
                    `}
                </div>
            `;
            hiresList.appendChild(card);
        }
    } catch (error) {
        console.error('Error loading hires:', error);
        hiresList.innerHTML = "<p>Error loading hires.</p>";
    }
}

// Notifications
async function loadNotifications() {
    const user = await getCurrentUser();
    if (!user) return;
    const list = document.getElementById("notificationsList");
    if (!list) return;

    try {
        const { data: notifications, error } = await supabase
            .from('notification')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false });
        if (error) throw error;

        list.innerHTML = '';
        if (!notifications || notifications.length === 0) {
            list.innerHTML = "<li>No notifications</li>";
            return;
        }
        notifications.forEach(n => {
            const li = document.createElement("li");
            li.innerHTML = `${n.message} <button class="dismiss-btn" data-id="${n.id}">Dismiss</button>`;
            list.appendChild(li);
        });

        // Attach dismiss handlers
        document.querySelectorAll(".dismiss-btn").forEach(btn => {
            btn.addEventListener("click", async (e) => {
                const id = e.target.dataset.id;
                const { error } = await supabase
                    .from('notification')
                    .delete()
                    .eq('id', id);
                if (!error) e.target.parentElement.remove();
            });
        });
    } catch (error) {
        console.error('Error loading notifications:', error);
        list.innerHTML = "<li>Error loading notifications.</li>";
    }
}

// Real-time notifications via Supabase Realtime
let notificationChannel = null;
function subscribeToNotifications(userId) {
    if (!userId) return;
    if (notificationChannel) return;

    notificationChannel = supabase
        .channel('notifications:' + userId)
        .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'notification',
            filter: `user_id=eq.${userId}`
        }, (payload) => {
            const data = payload.new;
            const list = document.getElementById("notificationsList");
            if (list) {
                const li = document.createElement("li");
                li.innerHTML = `${data.message} <button class="dismiss-btn" data-id="${data.id}">Dismiss</button>`;
                list.prepend(li);
                li.querySelector('.dismiss-btn').addEventListener('click', async (e) => {
                    const id = e.target.dataset.id;
                    const { error } = await supabase
                        .from('notification')
                        .delete()
                        .eq('id', id);
                    if (!error) e.target.parentElement.remove();
                });
            }
        })
        .subscribe();
}

// Freelancer summary dashboard
async function loadFreelancerSummary() {
    const user = await getCurrentUser();
    if (!user) return;

    try {
        // Total earnings
        const { data: earnings, error: earnError } = await supabase
            .from('coin_transaction')
            .select('amount')
            .eq('to_user_id', user.id)
            .in('type', ['payment', 'milestone_payment']);
        if (earnError) throw earnError;
        const totalEarnings = (earnings || []).reduce((sum, tx) => sum + parseFloat(tx.amount || 0), 0);

        // Hires for active/completed counts
        const { data: hires, error: hiresError } = await supabase
            .from('hire')
            .select(`
                *,
                job:job_id(*, milestones:milestone(*)),
                final_submissions:final_submission(*)
            `)
            .eq('freelancer_id', user.id);
        if (hiresError) throw hiresError;

        let activeProjects = 0;
        let completedProjects = 0;

        for (const hire of (hires || [])) {
            const job = hire.job;
            if (job.payment_type === 'milestone') {
                const milestones = job.milestones || [];
                const allApproved = milestones.length > 0 && milestones.every(m => m.status === 'approved');
                if (allApproved) completedProjects += 1;
                else activeProjects += 1;
            } else {
                const hasApproved = hire.final_submissions?.some(s => s.status === 'approved');
                if (hasApproved) completedProjects += 1;
                else activeProjects += 1;
            }
        }

        const updateElement = (id, value) => {
            const el = document.getElementById(id);
            if (el) el.textContent = value;
        };

        const nameEl = document.getElementById("userName");
        if (nameEl) {
            nameEl.textContent = user.full_name || user.username;
            if (user.main_badge) {
                const badgeSpan = document.createElement("span");
                badgeSpan.className = "main-badge";
                badgeSpan.textContent = user.main_badge.name;
                nameEl.appendChild(badgeSpan);
            }
        }

        updateElement("totalEarnings", `${totalEarnings} $`);
        updateElement("coinBalance", `${user.coin_balance} $`);
        updateElement("activeProjects", activeProjects);
        updateElement("completedProjects", completedProjects);
        updateElement("memberSince", new Date(user.created_at).toLocaleDateString());
        updateElement("verifiedStatus", user.verified ? "✅ Verified" : "❌ Not Verified");
        updateElement("accountNumber", user.account_number || 'N/A');
        updateElement("communicationTone", user.tone || "Not set");
        updateElement("preferredLanguage", user.language || "Not set");
    } catch (error) {
        console.error('Error loading freelancer summary:', error);
    }
}

// Theme toggle (unchanged)
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

// Verification banner
async function loadVerificationBanner() {
    const user = await getCurrentUser();
    if (!user) return;
    const banner = document.getElementById("verificationBanner");
    if (!banner) return;
    const verifyBtn = document.getElementById("verifyNowBtn");
    const closeBtn = document.getElementById("closeBanner");

    if (!user.id_verified) {
        banner.style.display = 'block';
        const statusDiv = banner.querySelector('.banner-text h3');
        const statusP = banner.querySelector('.banner-text p');
        if (user.gov_id_path) {
            if (user.id_rejection_reason) {
                banner.classList.add('rejected');
                if (statusDiv) statusDiv.textContent = 'ID Verification Rejected';
                if (statusP) statusP.textContent = `Reason: ${user.id_rejection_reason}. Please upload a new ID.`;
                if (verifyBtn) verifyBtn.textContent = 'Upload New ID';
            } else {
                banner.classList.add('pending');
                if (statusDiv) statusDiv.textContent = 'Verification Pending';
                if (statusP) statusP.textContent = 'Your ID is under review. We\'ll notify you once verified.';
                if (verifyBtn) verifyBtn.textContent = 'View Status';
            }
        } else {
            banner.classList.remove('pending', 'rejected');
            if (statusDiv) statusDiv.textContent = 'Complete ID Verification';
            if (statusP) statusP.textContent = 'Verify your identity to unlock all platform features';
            if (verifyBtn) verifyBtn.textContent = 'Verify Now';
        }
        if (verifyBtn) verifyBtn.onclick = () => window.location.href = 'settings.html';
        if (closeBtn) closeBtn.onclick = () => {
            banner.style.display = 'none';
            localStorage.setItem('bannerDismissed', Date.now().toString());
        };
    } else {
        banner.style.display = 'none';
    }
}

// Initialize everything on page load
document.addEventListener("DOMContentLoaded", async () => {
    await getCurrentUser(); // ensures redirect if not logged in
    loadAvailability();
    loadMatchedJobs();
    loadHires();
    loadNotifications();
    loadFreelancerSummary();
    loadVerificationBanner();

    // Subscribe to real-time notifications
    if (currentUser) {
        subscribeToNotifications(currentUser.id);
    }

    // Toggle availability button
    const toggle = document.getElementById("availabilityToggle");
    if (toggle) {
        toggle.addEventListener("change", toggleAvailability);
    }

    initThemeToggle();
});

// Export functions for inline onclick handlers
window.toggleDescription = function(button) {
    const description = button.previousElementSibling;
    const isExpanded = description.classList.contains('collapsed');
    const label = button.querySelector('.label');
    const icon = button.querySelector('.icon');
    if (isExpanded) {
        description.classList.remove('collapsed');
        label.textContent = 'Show less';
        button.classList.add('expanded');
    } else {
        description.classList.add('collapsed');
        label.textContent = 'Show more';
        button.classList.remove('expanded');
    }
};

window.toggleOutcome = function(button) {
    const outcomeContent = button.previousElementSibling;
    const isExpanded = outcomeContent.classList.contains('collapsed');
    const label = button.querySelector('.label');
    const icon = button.querySelector('.icon');
    if (isExpanded) {
        outcomeContent.classList.remove('collapsed');
        label.textContent = 'Show less';
        button.classList.add('expanded');
    } else {
        outcomeContent.classList.add('collapsed');
        label.textContent = 'Show more';
        button.classList.remove('expanded');
    }
};