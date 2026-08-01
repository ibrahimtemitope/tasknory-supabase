// Import the global Supabase client
import { supabase, getCurrentUser, STORAGE_BASE } from './api.js';

async function requireAdmin() {
    try {
        const user = await getCurrentUser();
        if (!user || user.role !== 'admin') {
            window.location.href = "../client/login.html";
            return null;
        }
        return user;
    } catch (error) {
        window.location.href = "../client/login.html";
        return null;
    }
}

let resultsDiv;

function getResultsDiv() {
    if (!resultsDiv) {
        resultsDiv = document.getElementById("results");
    }
    return resultsDiv;
}

// Load users awaiting verification (ID verification)
export async function loadPendingUsers() {
    const resultsDiv = getResultsDiv();
    if (!resultsDiv) return;
    resultsDiv.innerHTML = "<h2>Pending Users</h2><div class='loading'>Loading...</div>";

    try {
        const { data, error } = await supabase
            .from('users')
            .select('*')
            .eq('id_verified', false)
            .not('gov_id_path', 'is', null);
        if (error) throw error;

        resultsDiv.innerHTML = "<h2>Pending Users</h2>";
        if (!data || data.length === 0) {
            resultsDiv.innerHTML += "<p>No pending users.</p>";
            return;
        }

        for (const user of data) {
            let idUrl = null;
            if (user.gov_id_path) {
                // gov_id_path stored as full Supabase Storage URL or relative path
                idUrl = user.gov_id_path.startsWith('http')
                    ? user.gov_id_path
                    : `${STORAGE_BASE}/id_verifications/${user.gov_id_path}`;
            }

            resultsDiv.innerHTML += `
                <div class="card">
                    <p><b>${user.full_name}</b> (${user.role})</p>
                    <p>Email: ${user.email}</p>
                    ${idUrl ? `<p><a href="${idUrl}" target="_blank">View ID Document</a></p>` : `<p><i>No ID uploaded</i></p>`}
                    <button onclick="verifyUser('${user.id}')">Verify</button>
                </div>
            `;
        }
    } catch (error) {
        resultsDiv.innerHTML = "Error loading users.";
        console.error(error);
    }
}

window.verifyUser = async function (userId) {
    try {
        const { error } = await supabase
            .from('users')
            .update({ id_verified: true, id_rejection_reason: '' })
            .eq('id', userId);
        if (error) throw error;

        // Send notification to user
        await supabase.from('notification').insert({
            user_id: userId,
            type: 'id_verified',
            message: 'Your ID has been verified.',
            read: false
        });

        alert("User verified!");
        loadPendingUsers();
    } catch (error) {
        alert("Verification failed: " + (error.message || error));
    }
};

export async function loadPendingJobs() {
    const resultsDiv = getResultsDiv();
    if (!resultsDiv) return;
    resultsDiv.innerHTML = "<h2>Pending Jobs</h2><div class='loading'>Loading...</div>";

    try {
        const { data: jobs, error } = await supabase
            .from('job')
            .select(`
                *,
                client:client_id(full_name),
                milestones:milestone(*),
                required_skills:job_required_skill(skill:skill_id(*))
            `)
            .eq('approved', false)
            .order('created_at', { ascending: false });
        if (error) throw error;

        resultsDiv.innerHTML = "<h2>Pending Jobs</h2>";

        if (!jobs || jobs.length === 0) {
            resultsDiv.innerHTML += "<p>No pending jobs for approval.</p>";
            return;
        }

        jobs.forEach(job => {
            const paymentType = job.payment_type || 'single';
            const paymentTypeBadge = paymentType === 'milestone'
                ? '<span style="background: #ffd700; color: #000; padding: 2px 8px; border-radius: 12px; font-size: 12px; margin-left: 8px;">💰 Milestone-based</span>'
                : '<span style="background: #007bff; color: white; padding: 2px 8px; border-radius: 12px; font-size: 12px; margin-left: 8px;">💳 Single Payment</span>';

            let milestonesHTML = '';
            if (paymentType === 'milestone' && job.milestones && job.milestones.length > 0) {
                milestonesHTML = `
                    <div style="margin-top: 10px; padding: 10px; background: #f8f9fa; border-radius: 8px;">
                        <strong>📋 Milestones:</strong>
                        <div style="margin-top: 8px;">
                            ${job.milestones.sort((a, b) => a.sequence - b.sequence).map(m => `
                                <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 6px; padding: 6px; background: white; border-radius: 4px;">
                                    <div style="flex: 1;">
                                        <strong>${m.sequence}. ${m.title}</strong>
                                        <div style="font-size: 12px; color: #666; margin-top: 2px;">${m.description}</div>
                                    </div>
                                    <div style="font-weight: bold; color: #28a745; margin-left: 10px;">$${m.amount}</div>
                                </div>
                            `).join('')}
                        </div>
                        <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #ddd; font-weight: bold;">Total Budget: $${job.budget}</div>
                    </div>
                `;
            } else {
                milestonesHTML = `<div style="margin-top: 8px;"><strong>Budget:</strong> $${job.budget}</div>`;
            }

            resultsDiv.innerHTML += `
                <div class="card" style="margin-bottom: 16px; padding: 16px;">
                    <h3 style="margin: 0 0 8px 0;">${job.title} ${paymentTypeBadge}</h3>
                    <p style="margin: 0 0 8px 0; color: #666;">${job.description}</p>
                    ${milestonesHTML}
                    <div style="margin-top: 12px; font-size: 12px; color: #888;">
                        <div><strong>Preferred Tone:</strong> ${job.preferred_tone || 'Not specified'}</div>
                        <div><strong>Language:</strong> ${job.language || 'English'}</div>
                        <div><strong>Deadline:</strong> ${job.deadline ? new Date(job.deadline).toLocaleDateString() : 'Not set'}</div>
                    </div>
                    <div style="margin-top: 16px;">
                        <button onclick="approveJob('${job.id}')" style="background: #28a745; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer;">✅ Approve Job</button>
                        <button onclick="viewJobDetails('${job.id}')" style="background: #6c757d; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; margin-left: 8px;">🔍 View Details</button>
                    </div>
                </div>
            `;
        });
    } catch (error) {
        resultsDiv.innerHTML = "Error loading jobs.";
        console.error(error);
    }
}

window.viewJobDetails = async function(jobId) {
    try {
        const { data: job, error } = await supabase
            .from('job')
            .select(`
                *,
                client:client_id(full_name),
                milestones:milestone(*),
                required_skills:job_required_skill(skill:skill_id(*))
            `)
            .eq('id', jobId)
            .single();
        if (error || !job) {
            alert("Job not found");
            return;
        }

        const paymentType = job.payment_type || 'single';
        
        let modalContent = `
            <div style="max-width: 600px; max-height: 80vh; overflow-y: auto;">
                <h2>Job Details: ${job.title}</h2>
                <div style="margin-bottom: 16px;">
                    <strong>Posted by:</strong> ${job.client?.full_name || 'Unknown'}
                </div>
                <div style="margin-bottom: 16px;">
                    <strong>Description:</strong>
                    <p>${job.description}</p>
                </div>
                <div style="margin-bottom: 16px;">
                    <strong>Expected Outcome:</strong>
                    <p>${job.expected_outcome || 'Not specified'}</p>
                </div>
                <div style="margin-bottom: 16px;">
                    <strong>Payment Type:</strong> ${paymentType === 'milestone' ? '💰 Milestone-based' : '💳 Single Payment'}
                </div>
        `;

        if (paymentType === 'milestone' && job.milestones && job.milestones.length > 0) {
            modalContent += `
                <div style="margin-bottom: 16px;">
                    <strong>Project Milestones:</strong>
                    ${job.milestones.sort((a, b) => a.sequence - b.sequence).map(milestone => `
                        <div style="border: 1px solid #ddd; border-radius: 8px; padding: 12px; margin: 8px 0; background: #f8f9fa;">
                            <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                                <div style="flex: 1;">
                                    <h4 style="margin: 0 0 4px 0;">${milestone.sequence}. ${milestone.title}</h4>
                                    <p style="margin: 0 0 8px 0; color: #666;">${milestone.description}</p>
                                </div>
                                <div style="font-weight: bold; color: #28a745; font-size: 16px;">
                                    $${milestone.amount}
                                </div>
                            </div>
                        </div>
                    `).join('')}
                    <div style="text-align: right; font-weight: bold; font-size: 16px; margin-top: 8px;">
                        Total: $${job.budget}
                    </div>
                </div>
            `;
        } else {
            modalContent += `
                <div style="margin-bottom: 16px;">
                    <strong>Budget:</strong> $${job.budget}
                </div>
            `;
        }

        modalContent += `
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px;">
                <div><strong>Preferred Tone:</strong><br>${job.preferred_tone || 'Not specified'}</div>
                <div><strong>Language:</strong><br>${job.language || 'English'}</div>
                <div><strong>Deadline:</strong><br>${job.deadline ? new Date(job.deadline).toLocaleDateString() : 'Not set'}</div>
                <div><strong>Required Skills:</strong><br>${job.required_skills?.length || 0} skills</div>
            </div>
            
            <div style="text-align: center; margin-top: 20px;">
                <button class="approve-job-btn" data-job-id="${job.id}" 
                    style="background: #28a745; color: white; border: none; padding: 10px 20px; border-radius: 4px; cursor: pointer; margin-right: 8px;">
                    ✅ Approve Job
                </button>
                <button class="close-modal-btn" 
                    style="background: #6c757d; color: white; border: none; padding: 10px 20px; border-radius: 4px; cursor: pointer;">
                    Close
                </button>
            </div>
        </div>
        `;

        // Create modal
        const modal = document.createElement('div');
        modal.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100%; height: 100%; 
            background: rgba(0,0,0,0.5); display: flex; align-items: center; 
            justify-content: center; z-index: 1000;
        `;
        modal.innerHTML = `
            <div style="background: white; padding: 24px; border-radius: 8px; width: 90%; max-width: 700px;">
                ${modalContent}
            </div>
        `;
        
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                document.body.removeChild(modal);
            }
        });
        
        document.body.appendChild(modal);

        const approveBtn = modal.querySelector('.approve-job-btn');
        const closeBtn = modal.querySelector('.close-modal-btn');
        
        if (approveBtn) {
            approveBtn.addEventListener('click', () => {
                approveJob(job.id);
                document.body.removeChild(modal);
            });
        }
        
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                document.body.removeChild(modal);
            });
        }
    } catch (error) {
        console.error('Error loading job details:', error);
        alert('Error loading job details: ' + (error.message || error));
    }
};

window.approveJob = async function (jobId) {
    try {
        // 1. Approve the job
        const { error: updateError } = await supabase
            .from('job')
            .update({ approved: true })
            .eq('id', jobId);
        if (updateError) throw updateError;

        // 2. Run matching via RPC (PostgreSQL function)
        const { error: matchError } = await supabase.rpc('run_job_matching', { p_job_id: jobId });
        if (matchError) {
            console.error('Matching error:', matchError);
            // Non-fatal: job is approved, matching may need manual retry
        }

        // 3. Notify client
        const { data: job } = await supabase.from('job').select('client_id, title').eq('id', jobId).single();
        if (job) {
            await supabase.from('notification').insert({
                user_id: job.client_id,
                type: 'job_approved',
                message: `Your job "${job.title}" has been approved and is now live.`,
                read: false
            });
        }

        alert("Job approved and matching started!");
        loadPendingJobs();
    } catch (error) {
        alert("Approval failed: " + (error.message || error));
    }
};

export async function loadPendingMatches() {
    const resultsDiv = getResultsDiv();
    if (!resultsDiv) return;
    resultsDiv.innerHTML = "<h2>All Job Matches (View Only)</h2><div class='loading'>Loading...</div>";

    try {
        const { data: matches, error } = await supabase
            .from('job_match')
            .select(`
                *,
                job:job_id(*, client:client_id(full_name)),
                freelancer:freelancer_id(*, main_badge:main_badge_id(*))
            `);
        if (error) throw error;

        resultsDiv.innerHTML = "<h2>All Job Matches (View Only)</h2>";

        if (!matches || matches.length === 0) {
            resultsDiv.innerHTML += '<div class="empty-matches"><p>No matches found.</p></div>';
            return;
        }

        const matchesByJob = {};
        matches.forEach(match => {
            const jobId = match.job?.id;
            if (!jobId) return;
            if (!matchesByJob[jobId]) matchesByJob[jobId] = { job: match.job, matches: [] };
            matchesByJob[jobId].matches.push(match);
        });

        Object.values(matchesByJob).forEach(jobGroup => {
            const job = jobGroup.job;
            const jobMatches = jobGroup.matches;
            const paymentTypeClass = job.payment_type === 'milestone' ? 'milestone' : 'single';
            const jobStatusClass = job.approved ? 'approved' : 'pending';
            const jobDate = job.created_at ? new Date(job.created_at).toLocaleDateString() : 'Unknown';

            resultsDiv.innerHTML += `
                <div class="job-match-card">
                    <div class="job-header">
                        <h3>${job.title} <span class="payment-badge ${paymentTypeClass}">${job.payment_type === 'milestone' ? '💰 Milestone-based' : '💳 Single Payment'}</span></h3>
                        <p>${job.description}</p>
                        <div><strong>Client:</strong> ${job.client?.full_name || 'Unknown'}</div>
                        <div><strong>Job Status:</strong> <span class="job-status ${jobStatusClass}">${job.approved ? '✅ Approved' : '⏳ Pending Approval'}</span></div>
                        <div><strong>Posted:</strong> ${jobDate}</div>
                        <div><strong>Total Matches:</strong> ${jobMatches.length}</div>
                    </div>
                    <div class="matches-container">
                        <h4>🧩 Matched Freelancers</h4>
            `;

            jobMatches.sort((a, b) => b.score - a.score).forEach(match => {
                const freelancer = match.freelancer;
                const matchStatusClass = match.approved ? 'approved' : 'active';
                let badgesHTML = '';
                if (freelancer.tasknory_choice) badgesHTML += '<span class="badge choice">⭐ Choice</span>';
                if (freelancer.tasknory_partner) badgesHTML += '<span class="badge partner">🤝 Partner</span>';
                if (freelancer.main_badge) badgesHTML += `<span class="badge main">${freelancer.main_badge.name}</span>`;

                resultsDiv.innerHTML += `
                    <div class="freelancer-match">
                        <div><strong>${freelancer.full_name}</strong> ${badgesHTML}</div>
                        <div>Tone: ${freelancer.tone || 'Not specified'} • Language: ${freelancer.language || 'English'}</div>
                        <div>Match Score: <span class="match-score">${match.score}%</span> • <span class="match-status ${matchStatusClass}">${match.approved ? '✅ Match Approved' : '📊 Active Match'}</span></div>
                        <div>Match ID: ${match.id}</div>
                    </div>
                `;
            });

            resultsDiv.innerHTML += `</div></div>`;
        });

        const totalMatches = matches.length;
        const approvedMatches = matches.filter(m => m.approved).length;
        const pendingMatches = totalMatches - approvedMatches;
        const uniqueJobs = new Set(matches.map(m => m.job?.id)).size;
        const uniqueFreelancers = new Set(matches.map(m => m.freelancer?.id)).size;

        resultsDiv.innerHTML += `
            <div class="stats-panel">
                <h4>📊 Match Statistics</h4>
                <div>Total Matches: ${totalMatches}</div>
                <div>Active Jobs: ${uniqueJobs}</div>
                <div>Unique Freelancers: ${uniqueFreelancers}</div>
                <div>Approved Matches: ${approvedMatches}</div>
                <div>Pending Matches: ${pendingMatches}</div>
            </div>
        `;
    } catch (error) {
        resultsDiv.innerHTML = '<div class="error-matches">Error loading matches.</div>';
        console.error(error);
    }
}

export async function loadPendingIdVerifications() {
    const resultsDiv = getResultsDiv();
    if (!resultsDiv) return;

    resultsDiv.innerHTML = "<h2>Pending ID Verifications</h2><div class='loading'>Loading...</div>";

    try {
        const { data: users, error } = await supabase
            .from('users')
            .select('*')
            .eq('id_verified', false)
            .not('gov_id_path', 'is', null);
        if (error) throw error;

        resultsDiv.innerHTML = "<h2>Pending ID Verifications</h2>";

        if (!users || users.length === 0) {
            resultsDiv.innerHTML += "<p>No pending ID verifications.</p>";
            return;
        }

        for (const user of users) {
            let idUrl = user.gov_id_path;
            if (idUrl && !idUrl.startsWith('http')) {
                idUrl = `${STORAGE_BASE}/id_verifications/${idUrl}`;
            }

            resultsDiv.innerHTML += `
                <div class="card">
                    <p><b>${user.full_name}</b> (${user.role})</p>
                    <p>Email: ${user.email}</p>
                    <p>Submitted: ${new Date(user.created_at).toLocaleString()}</p>
                    ${user.id_rejection_reason ? `<p class="rejection-reason"><b>Previous Rejection:</b> ${user.id_rejection_reason}</p>` : ''}
                    <div class="id-preview">
                        ${idUrl ? `<p><a href="${idUrl}" target="_blank">📄 View ID Document</a></p>` : `<p><i>ID document not accessible</i></p>`}
                    </div>
                    <div class="verification-actions">
                        <button onclick="approveIdVerification('${user.id}')">✅ Approve</button>
                        <button onclick="showRejectionModal('${user.id}', '${user.full_name}')">❌ Reject</button>
                    </div>
                </div>
            `;
        }
    } catch (error) {
        resultsDiv.innerHTML = "Error loading ID verifications.";
        console.error(error);
    }
}

window.approveIdVerification = async function (userId) {
    try {
        const { error } = await supabase
            .from('users')
            .update({ id_verified: true, id_rejection_reason: '' })
            .eq('id', userId);
        if (error) throw error;

        await supabase.from('notification').insert({
            user_id: userId,
            type: 'id_verified',
            message: 'Your ID has been verified.',
            read: false
        });

        alert("ID approved successfully!");
        loadPendingIdVerifications();
    } catch (error) {
        alert("Approval failed: " + (error.message || error));
    }
};

window.showRejectionModal = function (userId, userName) {
    const reason = prompt(`Enter rejection reason for ${userName}:`, "ID document unclear, please upload a clearer image");
    if (reason === null) return;
    if (!reason.trim()) {
        alert("Please provide a rejection reason.");
        return;
    }
    rejectIdVerification(userId, reason.trim());
};

async function rejectIdVerification(userId, reason) {
    try {
        const { error } = await supabase
            .from('users')
            .update({ id_verified: false, id_rejection_reason: reason })
            .eq('id', userId);
        if (error) throw error;

        await supabase.from('notification').insert({
            user_id: userId,
            type: 'id_rejected',
            message: `Your ID was rejected: ${reason}`,
            read: false
        });

        alert("ID rejected successfully!");
        loadPendingIdVerifications();
    } catch (error) {
        alert("Rejection failed: " + (error.message || error));
    }
}

document.addEventListener("DOMContentLoaded", async () => {
    await requireAdmin();
    document.getElementById("btnUsers")?.addEventListener("click", loadPendingUsers);
    document.getElementById("btnJobs")?.addEventListener("click", loadPendingJobs);
    document.getElementById("btnMatch")?.addEventListener("click", loadPendingMatches);
    document.getElementById("btnIdVerifications")?.addEventListener("click", loadPendingIdVerifications);
});