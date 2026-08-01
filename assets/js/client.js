import { supabase, getCurrentUser } from './api.js';

// Utility
function formToObject(form) {
    const data = new FormData(form);
    return Object.fromEntries(data.entries());
}

// Get current user (from Supabase Auth + public.users profile)
let currentUser = null;

// Handle job posting
async function handleJobPost(event) {
    event.preventDefault();

    const user = await getCurrentUser();
    if (!user) return;

    const data = formToObject(event.target);
    const checkboxes = document.querySelectorAll('#skillsCheckboxContainer .skill-checkbox:checked');
    const selectedSkillIds = Array.from(checkboxes).map(cb => parseInt(cb.value));

    // Update hidden input
    const skillsInput = document.getElementById("requiredSkillsSelect");
    if (skillsInput) skillsInput.value = selectedSkillIds.join(',');

    const paymentType = data.payment_type;
    let milestonesData = [];
    let totalBudget = 0;

    if (paymentType === 'milestone') {
        milestonesData = collectMilestonesData();
        if (milestonesData.length === 0) {
            alert("Please add at least one milestone for milestone-based jobs.");
            return;
        }
        totalBudget = milestonesData.reduce((sum, milestone) => sum + milestone.amount, 0);
        if (totalBudget <= 0) {
            alert("Total milestone budget must be greater than 0.");
            return;
        }
    } else {
        totalBudget = parseFloat(data.budget);
    }

    // Prepare job data
    const jobData = {
        client_id: user.id,
        title: data.title,
        description: data.description,
        expected_outcome: data.expected_outcome,
        preferred_tone: data.preferred_tone,
        budget: totalBudget,
        language: data.language || "English",
        deadline: data.deadline || null,
        payment_type: paymentType,
    };

    try {
        // Create job
        const { data: job, error: jobError } = await supabase
            .from('job')
            .insert(jobData)
            .select()
            .single();
        if (jobError) throw jobError;

        // Link skills
        if (selectedSkillIds.length > 0) {
            const skillLinks = selectedSkillIds.map(skillId => ({
                job_id: job.id,
                skill_id: skillId
            }));
            const { error: skillError } = await supabase
                .from('job_required_skill')
                .insert(skillLinks);
            if (skillError) throw skillError;
        }

        // If milestones, create them
        if (paymentType === 'milestone' && milestonesData.length > 0) {
            const milestoneRows = milestonesData.map(m => ({
                job_id: job.id,
                title: m.title,
                description: m.description,
                amount: m.amount,
                sequence: m.sequence
            }));
            const { error: msError } = await supabase
                .from('milestone')
                .insert(milestoneRows);
            if (msError) throw msError;
        }

        alert("Job submitted! Awaiting admin approval.");
        event.target.reset();

        // Reset UI
        const milestonesSection = document.getElementById("milestonesSection");
        const singleBudgetGroup = document.getElementById("singleBudgetGroup");
        const paymentTypeSelect = document.getElementById("payment_type");
        if (milestonesSection) milestonesSection.style.display = 'none';
        if (singleBudgetGroup) singleBudgetGroup.style.display = 'block';
        if (paymentTypeSelect) paymentTypeSelect.value = 'single';
        const milestonesContainer = document.getElementById("milestonesContainer");
        if (milestonesContainer) milestonesContainer.innerHTML = '';

    } catch (error) {
        console.error('Job posting error:', error);
        alert("Job posting failed: " + (error.message || error));
    }
}

// Collect milestones data from form (unchanged)
function collectMilestonesData() {
    const milestones = [];
    const milestoneElements = document.querySelectorAll('.milestone-item');
    milestoneElements.forEach((element, index) => {
        const title = element.querySelector('.milestone-title')?.value;
        const amount = element.querySelector('.milestone-amount')?.value;
        const description = element.querySelector('.milestone-description')?.value;
        if (title && amount && description) {
            milestones.push({
                sequence: index + 1,
                title: title.trim(),
                amount: parseFloat(amount),
                description: description.trim()
            });
        }
    });
    return milestones;
}

// Load matches for this client - with offer system
export async function loadMatches() {
    const user = await getCurrentUser();
    if (!user) return;

    const matchesList = document.getElementById("matchesList");
    if (!matchesList) return;

    matchesList.innerHTML = '<div class="loading">Loading your matches...</div>';

    try {
        const { data: matches, error } = await supabase
            .from('job_match')
            .select(`
                *,
                job:job_id(
                    *,
                    required_skills:job_required_skill(
                        skill:skill_id(*)
                    )
                ),
                freelancer:freelancer_id(
                    *,
                    main_badge:main_badge_id(*),
                    freelancer_skills:freelancer_skill(
                        *,
                        skill:skill_id(*)
                    )
                )
            `)
            .eq('job.client_id', user.id);
        if (error) throw error;

        matchesList.innerHTML = '<div class="matches-grid"></div>';
        const matchesGrid = matchesList.querySelector(".matches-grid");

        if (!matches || matches.length === 0) {
            matchesGrid.innerHTML = "<p class='loading'>No available matches.</p>";
            return;
        }

        matches.forEach((match, index) => {
            const job = match.job || {};
            const freelancer = match.freelancer || {};

            // Safely get job title
            const jobTitle = job.title || 'Untitled Job';
            const jobDescription = job.description || 'No description provided';

            // Payment type badge
            const paymentTypeBadge = job.payment_type === 'milestone' 
                ? '<span class="badge milestone-badge">💰 Milestone-based</span>'
                : '<span class="badge single-badge">💳 Single Payment</span>';

            // Offer status
            let offerStatusHtml = '';
            let actionButtonHtml = '';

            switch(match.offer_status) {
                case 'sent':
                    offerStatusHtml = `
                        <div class="offer-status pending">
                            <span class="badge badge-yellow">📬 Offer Sent</span>
                            <small>Waiting for freelancer response...</small>
                        </div>
                    `;
                    actionButtonHtml = `<button class="btn btn-secondary" disabled>Offer Pending</button>`;
                    break;
                case 'accepted':
                    offerStatusHtml = `
                        <div class="offer-status accepted">
                            <span class="badge badge-green">✅ Offer Accepted</span>
                            <small>Ready to hire!</small>
                        </div>
                    `;
                    actionButtonHtml = `
                        <button class="btn btn-success hire-btn" 
                            data-match-id="${match.id}"
                            data-freelancer-id="${freelancer.id}"
                            data-freelancer-name="${freelancer.full_name || ''}"
                            data-job-id="${job.id}">
                            Hire Now
                        </button>
                    `;
                    break;
                case 'rejected':
                    offerStatusHtml = `
                        <div class="offer-status rejected">
                            <span class="badge badge-red">❌ Offer Declined</span>
                            <small>Freelancer declined the offer</small>
                        </div>
                    `;
                    actionButtonHtml = `<button class="btn btn-secondary" disabled>Offer Declined</button>`;
                    break;
                default:
                    actionButtonHtml = `
                        <button class="btn btn-primary send-offer-btn"
                            data-match-id="${match.id}"
                            data-freelancer-id="${freelancer.id}">
                            Request to Hire
                        </button>
                    `;
            }

            // Freelancer badges
            const mainBadgeName = freelancer.main_badge ? (freelancer.main_badge.name || '') : '';
            const badgesHtml = `
                ${mainBadgeName ? `<span class="badge ladder">${mainBadgeName}</span>` : ''}
                ${freelancer.tasknory_choice ? '<span class="badge choice">Tasknory Choice</span>' : ''}
                ${freelancer.tasknory_partner ? '<span class="badge partner">Tasknory Partner</span>' : ''}
            `;

            // Matched skills
            const requiredSkillIds = (job.required_skills || []).map(s => s.skill.id);
            const freelancerSkills = freelancer.freelancer_skills || [];
            const matchedSkillsHtml = freelancerSkills
                .filter(fs => requiredSkillIds.includes(fs.skill_id))
                .map(fs => `<li>${fs.skill.skill_name || 'Unknown skill'} ${fs.verified ? '<span class="badge verified">Verified</span>' : ''}</li>`)
                .join('');

            const card = document.createElement("div");
            card.classList.add("card");
            card.style.animationDelay = `${index * 0.1}s`;

            card.innerHTML = `
                <h3>${jobTitle}</h3>
                <p class="job-description">${jobDescription}</p>
                ${paymentTypeBadge}
                ${offerStatusHtml}
                <hr>
                <div class="match-info">
                    <p><strong>Freelancer:</strong> ${freelancer.full_name || 'Unknown'}</p>
                    <div class="freelancer-badges">${badgesHtml}</div>
                    <p><strong>Tone:</strong> ${freelancer.tone || 'Not specified'}</p>
                    <p><strong>Language:</strong> ${freelancer.language || 'Not specified'}</p>
                    <p><strong>Match Score:</strong> <span class="score-indicator">${match.score || 0}%</span></p>
                </div>
                <div class="matched-skills">
                    <h4>Matched Skills</h4>
                    ${matchedSkillsHtml ? `<ul>${matchedSkillsHtml}</ul>` : '<p class="no-skills">No skills matched yet</p>'}
                </div>
                <div class="card-actions">
                    ${actionButtonHtml}
                    <button class="btn btn-secondary view-profile-btn" data-id="${freelancer.id}">View Profile</button>
                </div>
            `;

            matchesGrid.appendChild(card);
        });

        // Attach event listeners
        document.querySelectorAll(".send-offer-btn").forEach(btn => {
            btn.addEventListener("click", (e) => {
                const matchId = e.target.dataset.matchId;
                const freelancerId = e.target.dataset.freelancerId;
                sendHireRequest(matchId, freelancerId);
            });
        });

        document.querySelectorAll(".hire-btn").forEach(btn => {
            btn.addEventListener("click", (e) => {
                const matchId = e.target.dataset.matchId;
                const freelancerId = e.target.dataset.freelancerId;
                const freelancerName = e.target.dataset.freelancerName;
                const jobId = e.target.dataset.jobId;
                hireFreelancer(matchId, freelancerId, freelancerName, jobId);
            });
        });

        document.querySelectorAll(".view-profile-btn").forEach(btn => {
            btn.addEventListener("click", (e) => {
                const freelancerId = e.target.dataset.id;
                window.location.href = `../client/freelancer-profile.html?id=${freelancerId}`;
            });
        });

    } catch (error) {
        console.error('Error loading matches:', error);
        matchesList.innerHTML = "<p class='error'>Error loading matches.</p>";
    }
}

// Send hire request to freelancer
async function sendHireRequest(matchId, freelancerId) {
    if (!confirm("Send hire request to this freelancer?")) return;
    try {
        const { error } = await supabase
            .from('job_match')
            .update({
                offer_status: 'sent',
                offer_sent_at: new Date().toISOString()
            })
            .eq('id', matchId);
        if (error) throw error;

        alert("✅ Hire request sent! The freelancer will respond soon.");
        loadMatches(); // refresh
    } catch (error) {
        console.error('Error sending hire request:', error);
        alert("Failed to send hire request. Please try again.");
    }
}

// Hire freelancer (after offer accepted)
// NOTE: This performs multiple DB operations. For production, consider moving
// this logic to a Supabase Edge Function to ensure atomicity and bypass RLS
// for cross-user notifications.
async function hireFreelancer(matchId, freelancerId, freelancerName, jobId) {
    const user = await getCurrentUser();
    if (!user) return;

    try {
        // 1. Verify match is accepted
        const { data: match, error: matchError } = await supabase
            .from('job_match')
            .select('*')
            .eq('id', matchId)
            .eq('offer_status', 'accepted')
            .single();
        if (matchError || !match) throw new Error('Cannot hire: freelancer has not accepted your offer.');

        // 2. Check if job already hired
        const { data: existingHire, error: hireCheckError } = await supabase
            .from('hire')
            .select('id')
            .eq('job_id', jobId)
            .maybeSingle();
        if (existingHire) throw new Error('This job has already been hired.');

        // 3. Get job budget
        const { data: job, error: jobError } = await supabase
            .from('job')
            .select('budget, title')
            .eq('id', jobId)
            .single();
        if (jobError) throw jobError;

        // 4. Check balance
        const { data: client, error: clientError } = await supabase
            .from('users')
            .select('coin_balance')
            .eq('id', user.id)
            .single();
        if (clientError) throw clientError;

        if (client.coin_balance < job.budget) {
            const shortfall = job.budget - client.coin_balance;
            throw new Error(
                `Insufficient balance. You need ${job.budget} $ ` +
                `but have ${client.coin_balance} $. Shortfall: ${shortfall} $. Please add more funds.`
            );
        }

        // 5. Deduct balance
        const newBalance = client.coin_balance - job.budget;
        const { error: balanceError } = await supabase
            .from('users')
            .update({ coin_balance: newBalance })
            .eq('id', user.id);
        if (balanceError) throw balanceError;

        // 6. Create hire
        const { data: hire, error: hireError } = await supabase
            .from('hire')
            .insert({
                job_id: jobId,
                client_id: user.id,
                freelancer_id: freelancerId,
                via_match: true
            })
            .select()
            .single();
        if (hireError) throw hireError;

        // 7. Update match
        const { error: matchUpdateError } = await supabase
            .from('job_match')
            .update({ approved: false })
            .eq('id', matchId);
        if (matchUpdateError) throw matchUpdateError;

        // 8. Record transaction
        const { error: txError } = await supabase
            .from('coin_transaction')
            .insert({
                from_user_id: user.id,
                from_user_name: user.full_name || user.username,
                to_user_id: freelancerId,
                to_user_name: freelancerName,
                amount: job.budget,
                type: 'payment',
                note: `Payment for job: ${job.title || 'Untitled'}`,
                balance_after: newBalance
            });
        if (txError) console.warn('Transaction log failed (RLS may block):', txError);

        // 9. Notify freelancer (may fail due to RLS; use Edge Function or DB trigger for production)
        const { error: notifError } = await supabase
            .from('notification')
            .insert({
                user_id: freelancerId,
                type: 'hire',
                message: `You have been hired for "${job.title || 'Untitled Job'}".`,
                read: false
            });
        if (notifError) console.warn('Freelancer notification failed (RLS may block):', notifError);

        alert(`✅ You hired ${freelancerName}!`);
        window.location.href = `../chat/chat.html?hire=${hire.id}`;

    } catch (error) {
        console.error('Hire error:', error);
        alert(error.message);
    }
}

// Load hires for client
async function loadHires() {
    const user = await getCurrentUser();
    if (!user) return;
    const container = document.getElementById("hiresList");
    if (!container) return;

    try {
        // 1. Fetch all hires for this client
        const { data: hires, error: hiresError } = await supabase
            .from('hire')
            .select(`
                *,
                job:job_id(*),
                freelancer:freelancer_id(full_name)
            `)
            .eq('client_id', user.id);
        if (hiresError) throw hiresError;

        // 2. Fetch final submissions for this client
        const { data: submissions, error: subError } = await supabase
            .from('final_submission')
            .select('*')
            .eq('client_id', user.id);
        if (subError) throw subError;
        const approvedHires = new Set();
        submissions.forEach(sub => {
            if (sub.status === 'approved') approvedHires.add(sub.hire_id);
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
                milestonesByJob[jobId].push(m.status);
            });
        }

        // 4. Filter out completed projects
        const filteredHires = hires.filter(hire => {
            if (hire.job.payment_type === 'single') {
                return !approvedHires.has(hire.id);
            } else if (hire.job.payment_type === 'milestone') {
                const statuses = milestonesByJob[hire.job.id] || [];
                if (statuses.length === 0) return true;
                const allApproved = statuses.every(s => s === 'approved');
                return !allApproved;
            }
            return true;
        });

        if (filteredHires.length === 0) {
            container.innerHTML = "<p class='loading'>No active hires.</p>";
            return;
        }

        // Render the filtered hires
        container.innerHTML = '<div class="hires-grid"></div>';
        const hiresGrid = container.querySelector(".hires-grid");

        filteredHires.forEach((hire, index) => {
            const job = hire.job;
            const paymentTypeBadge = job.payment_type === 'milestone'
                ? '<span class="badge milestone-badge">💰 Milestone-based</span>'
                : '<span class="badge single-badge">💳 Single Payment</span>';

            let statusInfo = '';
            if (job.payment_type === 'single') {
                const finalStatus = approvedHires.has(hire.id) ? 'approved' : 'pending';
                statusInfo = `<p><strong>Submission Status:</strong> ${finalStatus}</p>`;
            } else {
                const jobMilestones = milestonesByJob[job.id] || [];
                const approvedCount = jobMilestones.filter(s => s === 'approved').length;
                const totalCount = jobMilestones.length;
                statusInfo = `<p><strong>Milestone Progress:</strong> ${approvedCount}/${totalCount} completed</p>`;
            }

            const card = document.createElement("div");
            card.classList.add("card");
            card.style.animationDelay = `${index * 0.1}s`;

            card.innerHTML = `
                <h3>${job.title}</h3>
                ${paymentTypeBadge}
                <p>${job.description}</p>
                <p><strong>Freelancer:</strong> ${hire.freelancer?.full_name || 'Unknown'}</p>
                ${statusInfo}
                <small>Hired on ${new Date(hire.created_at).toLocaleString()}</small>
                <div class="card-actions">
                    <button class="btn btn-primary" onclick="window.location.href='../chat/chat.html?hire=${hire.id}'">Chat</button>
                    ${job.payment_type === 'milestone' ? `
                        <button class="btn btn-secondary" onclick="window.location.href='milestone-reviews.html?hire=${hire.id}'">Review Milestones</button>
                    ` : ''}
                </div>
            `;
            hiresGrid.appendChild(card);
        });
    } catch (error) {
        console.error('Error loading hires:', error);
        container.innerHTML = "<p class='error'>Error loading hires.</p>";
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
    if (notificationChannel) return; // already subscribed

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

// Client summary dashboard
async function loadClientSummary() {
    const user = await getCurrentUser();
    if (!user) return;

    try {
        // Calculate total spent from coin transactions
        const { data: txData, error: txError } = await supabase
            .from('coin_transaction')
            .select('amount')
            .eq('from_user_id', user.id)
            .in('type', ['payment', 'milestone_payment']);
        if (txError) throw txError;
        const totalSpent = (txData || []).reduce((sum, tx) => sum + parseFloat(tx.amount || 0), 0);

        // Calculate active projects
        const { data: hires, error: hiresError } = await supabase
            .from('hire')
            .select(`
                *,
                job:job_id(*, milestones:milestone(*)),
                final_submissions:final_submission(*)
            `)
            .eq('client_id', user.id);
        if (hiresError) throw hiresError;

        let activeProjects = 0;
        for (const hire of (hires || [])) {
            const job = hire.job;
            if (job.payment_type === 'milestone') {
                const milestones = job.milestones || [];
                if (!milestones.length || !milestones.every(m => m.status === 'approved')) {
                    activeProjects += 1;
                }
            } else {
                const subs = hire.final_submissions || [];
                if (!subs.some(s => s.status === 'approved')) {
                    activeProjects += 1;
                }
            }
        }

        const updateElement = (id, value) => {
            const el = document.getElementById(id);
            if (el) el.textContent = value;
        };

        updateElement("clientName", user.full_name);
        updateElement("coinBalance", `${user.coin_balance} $`);
        updateElement("totalSpent", `${totalSpent} $`);
        updateElement("activeProjects", activeProjects);
        const coinHoldsElement = document.getElementById("coinHolds");
        if (coinHoldsElement) coinHoldsElement.textContent = "0 $";
    } catch (error) {
        console.error('Error loading client summary:', error);
        const updateElement = (id, value) => {
            const el = document.getElementById(id);
            if (el) el.textContent = value;
        };
        updateElement("clientName", "Error loading");
        updateElement("coinBalance", "Error");
        updateElement("totalSpent", "Error");
        updateElement("activeProjects", "Error");
    }
}

// Theme toggle (copied from freelancer, but using 'client-theme')
function initThemeToggle() {
    const themeToggle = document.getElementById('themeToggle');
    if (!themeToggle) return;
    const themeIcon = themeToggle.querySelector('.theme-icon');
    const themeLabel = themeToggle.querySelector('.theme-label');
    const savedTheme = localStorage.getItem('client-theme');
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
            localStorage.setItem('client-theme', 'dark');
        } else {
            document.documentElement.setAttribute('data-theme', 'light');
            themeIcon.textContent = '🌙';
            themeLabel.textContent = 'Dark Mode';
            localStorage.setItem('client-theme', 'light');
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
    await getCurrentUser(); // redirect if not logged in

    // Load components based on current page
    if (document.getElementById("matchesList")) loadMatches();
    if (document.getElementById("notificationsList")) loadNotifications();
    if (document.getElementById("hiresList")) loadHires();
    if (document.getElementById("requiredSkillsSelect")) loadSkills("skillsCheckboxContainer");
    if (document.getElementById("clientName")) loadClientSummary();

    // Attach job form if exists
    const jobForm = document.getElementById("jobPostForm");
    if (jobForm) jobForm.addEventListener("submit", handleJobPost);

    // Subscribe to real-time notifications if user is logged in
    if (currentUser) subscribeToNotifications(currentUser.id);

    // Load verification banner if applicable
    if (shouldShowBanner()) await loadVerificationBanner();

    initThemeToggle();
});

// Helper to load skills (public)
async function loadSkills(containerId) {
    try {
        const { data: skills, error } = await supabase
            .from('skill')
            .select('*')
            .order('skill_name', { ascending: true });
        if (error) throw error;

        const container = document.getElementById(containerId);
        if (!container) return;
        container.innerHTML = '';
        skills.forEach(skill => {
            const wrapper = document.createElement('div');
            wrapper.className = 'skill-checkbox-wrapper';
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.id = `skill_${skill.id}`;
            checkbox.value = skill.id;
            checkbox.className = 'skill-checkbox';
            const label = document.createElement('label');
            label.htmlFor = `skill_${skill.id}`;
            label.textContent = skill.skill_name;
            label.className = 'skill-label';
            wrapper.appendChild(checkbox);
            wrapper.appendChild(label);
            container.appendChild(wrapper);
        });
    } catch (error) {
        console.error('Error loading skills:', error);
    }
}

// Banner dismissal check
function shouldShowBanner() {
    const dismissed = localStorage.getItem('bannerDismissed');
    if (!dismissed) return true;
    const dismissedTime = parseInt(dismissed);
    const now = Date.now();
    const hoursSinceDismissal = (now - dismissedTime) / (1000 * 60 * 60);
    return hoursSinceDismissal > 24;
}