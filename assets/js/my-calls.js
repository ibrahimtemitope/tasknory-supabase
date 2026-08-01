// my-calls.js — SUPABASE VERSION
// Import the global Supabase client
import { supabase, getCurrentUser } from './api.js';

let allCalls = [];
let currentFilter = 'all';

document.addEventListener('DOMContentLoaded', loadMyCalls);

async function loadMyCalls() {
    const container = document.getElementById('callsList');
    if (!container) return;

    container.innerHTML = '<div class="loading" style="text-align: center; padding: 3rem;">Loading your calls...</div>';

    try {
        const user = await getCurrentUser();
        if (!user) return;

        const { data: calls, error } = await supabase
            .from('consultation_request')
            .select(`
                *,
                scheduled_slot:scheduled_slot_id(*)
            `)
            .eq('client_id', user.id)
            .order('created_at', { ascending: false });
        if (error) throw error;

        allCalls = calls || [];
        renderCalls();
    } catch (error) {
        console.error('Error loading calls:', error);
        container.innerHTML = `
            <div class="empty-state">
                <div class="icon">❌</div>
                <h3>Error Loading Calls</h3>
                <p>Failed to load your calls. Please try again later.</p>
            </div>
        `;
    }
}

function renderCalls() {
    const container = document.getElementById('callsList');
    if (!container) return;

    let filtered = allCalls;
    if (currentFilter === 'other') {
        filtered = allCalls.filter(c => !['pending', 'scheduled', 'completed'].includes(c.status));
    } else if (currentFilter !== 'all') {
        filtered = allCalls.filter(c => c.status === currentFilter);
    }

    if (filtered.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="icon">📞</div>
                <h3>No ${currentFilter === 'all' ? '' : currentFilter.replace('_', ' ')} Calls</h3>
                <p>${getEmptyMessage(currentFilter)}</p>
                <a href="book-call.html" class="btn btn-primary">Book a Call</a>
            </div>
        `;
        return;
    }

    container.innerHTML = '';
    filtered.forEach(call => {
        const card = createCallCard(call);
        container.appendChild(card);
    });
}

function createCallCard(call) {
    const card = document.createElement('div');
    card.className = `call-card ${call.status}`;

    const callDate = new Date(call.created_at);
    const scheduledDate = call.scheduled_at ? new Date(call.scheduled_at) : null;

    let scheduledHtml = '';
    if (scheduledDate && ['scheduled', 'rescheduled'].includes(call.status)) {
        scheduledHtml = `
            <div class="scheduled-time">
                <div class="label">Scheduled For</div>
                <div class="time">${scheduledDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })} at ${scheduledDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</div>
            </div>
            <div class="reminder-box">
                <span class="icon">⏰</span>
                <strong>Reminder:</strong> You'll receive a notification 1 hour before your call. The meeting link will be sent to you shortly.
            </div>
        `;
    }

    let blockedHtml = '';
    if (call.status === 'blocked') {
        blockedHtml = `
            <div class="blocked-message">
                <strong>🔒 Blocked from Booking</strong>
                You missed two scheduled calls. You can book new calls after ${call.blocked_until ? new Date(call.blocked_until).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '24 hours'}.
            </div>
        `;
    }

    let actionsHtml = '';
    if (['pending', 'scheduled', 'rescheduled'].includes(call.status)) {
        actionsHtml = `
            <div class="call-actions">
                <button class="btn btn-secondary" onclick="cancelCall('${call.id}')">Cancel Request</button>
            </div>
        `;
    }

    const typeLabel = call.call_type === 'guidance' ? 'Guidance Call' : 'Freelance Request Call';
    const typeClass = call.call_type;

    // Compute display labels from raw values (since we don't have get_*_display() in JS)
    const projectLengthLabels = {
        'less_than_1_week': 'Less than 1 week',
        '1_2_weeks': '1-2 weeks',
        '1_month': '1 month',
        '1_3_months': '1-3 months',
        '3_6_months': '3-6 months',
        '6_plus_months': '6+ months',
        'ongoing': 'Ongoing / Long-term',
        'not_sure': 'Not Sure'
    };
    const commitmentLabels = {
        'full_time': 'Full Time',
        'part_time': 'Part Time',
        'project_based': 'Project Based',
        'hourly': 'Hourly',
        'not_sure': 'Not Sure'
    };
    const statusLabels = {
        'pending': 'Pending',
        'scheduled': 'Scheduled',
        'completed': 'Completed',
        'no_show': 'No Show',
        'rescheduled': 'Rescheduled',
        'blocked': 'Blocked',
        'cancelled': 'Cancelled'
    };

    const projectLengthDisplay = projectLengthLabels[call.project_length] || call.project_length;
    const commitmentDisplay = commitmentLabels[call.commitment_level] || call.commitment_level;
    const statusDisplay = statusLabels[call.status] || call.status;

    let detailsHtml = '';
    if (call.call_type === 'guidance') {
        detailsHtml = `
            <div class="detail-row">
                <span class="detail-label">Topic:</span>
                <span class="detail-value">${escapeHtml(call.guidance_topic || 'N/A')}</span>
            </div>
        `;
    } else {
        detailsHtml = `
            <div class="detail-row">
                <span class="detail-label">Job Role:</span>
                <span class="detail-value">${escapeHtml(call.job_role || 'N/A')}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Duration:</span>
                <span class="detail-value">${projectLengthDisplay || 'N/A'}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Commitment:</span>
                <span class="detail-value">${commitmentDisplay || 'N/A'}</span>
            </div>
        `;
    }

    card.innerHTML = `
        <div class="call-header">
            <div>
                <div class="call-title">${escapeHtml(call.guidance_topic || call.job_role || typeLabel)}</div>
                <span class="call-type-badge ${typeClass}">${typeLabel}</span>
            </div>
            <span class="status-badge ${call.status}">${statusDisplay}</span>
        </div>
        ${scheduledHtml}
        ${blockedHtml}
        <div class="call-details">
            ${detailsHtml}
            <div class="detail-row">
                <span class="detail-label">Requested:</span>
                <span class="detail-value">${callDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
            </div>
            ${call.no_show_count > 0 ? `
                <div class="detail-row">
                    <span class="detail-label">No Shows:</span>
                    <span class="detail-value">${call.no_show_count}/2</span>
                </div>
            ` : ''}
        </div>
        ${actionsHtml}
    `;

    return card;
}

function getEmptyMessage(filter) {
    const messages = {
        'all': "You haven't booked any calls yet.",
        'pending': 'No pending call requests.',
        'scheduled': 'No scheduled calls at the moment.',
        'completed': 'No completed calls yet.',
        'other': 'No calls in other statuses.'
    };
    return messages[filter] || 'No calls found.';
}

window.filterCalls = function(filter) {
    currentFilter = filter;

    // Update tab styles
    document.querySelectorAll('.status-tab').forEach(tab => {
        tab.classList.remove('active');
        if (tab.dataset.filter === filter) {
            tab.classList.add('active');
        }
    });

    renderCalls();
};

window.cancelCall = async function(callId) {
    if (!confirm('Are you sure you want to cancel this call request?')) return;

    try {
        // 1. Get the consultation request to find the scheduled slot
        const { data: call, error: fetchError } = await supabase
            .from('consultation_request')
            .select('scheduled_slot_id')
            .eq('id', callId)
            .single();
        if (fetchError) throw fetchError;

        // 2. Free up the slot if one was assigned
        if (call?.scheduled_slot_id) {
            const { error: slotError } = await supabase
                .from('consultation_slot')
                .update({ is_booked: false })
                .eq('id', call.scheduled_slot_id);
            if (slotError) console.error('Error freeing slot:', slotError);
        }

        // 3. Update the request status to cancelled
        const { error: updateError } = await supabase
            .from('consultation_request')
            .update({
                status: 'cancelled',
                scheduled_slot_id: null,
                scheduled_at: null
            })
            .eq('id', callId);
        if (updateError) throw updateError;

        alert('Call request cancelled successfully.');
        loadMyCalls(); // Refresh
    } catch (error) {
        console.error('Cancel error:', error);
        alert('Failed to cancel: ' + (error.message || error));
    }
};

function escapeHtml(text) {
    if (!text) return 'N/A';
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

document.addEventListener('DOMContentLoaded', initThemeToggle);