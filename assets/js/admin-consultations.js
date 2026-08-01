// admin-consultations.js — SUPABASE VERSION
import { supabase } from './api.js';

let consultations = [];
let currentConsultationId = null;
let selectedSlotId = null;
let availableSlots = [];

// Helper: get current admin user
async function getAdminUser() {
    const { data: { user: authUser }, error: authError } = await supabase.auth.getUser();
    if (authError || !authUser) {
        window.location.href = 'login.html';
        return null;
    }
    const { data: profile, error } = await supabase
        .from('users')
        .select('role')
        .eq('id', authUser.id)
        .single();
    if (error || profile?.role !== 'admin') {
        alert('Admin access required');
        window.location.href = '../client/dashboard.html';
        return null;
    }
    return authUser;
}

// Load consultations
window.loadConsultations = async function() {
    await getAdminUser();
    const tbody = document.getElementById('consultationsTable');
    tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 2rem;">Loading...</td></tr>';

    try {
        const status = document.getElementById('filterStatus').value;
        const type = document.getElementById('filterType').value;
        const search = document.getElementById('searchInput').value.trim().toLowerCase();

        let query = supabase
            .from('consultation_request')
            .select(`
                *,
                client:client_id(full_name, email),
                scheduled_slot:scheduled_slot_id(*)
            `)
            .order('created_at', { ascending: false });

        if (status) query = query.eq('status', status);
        if (type) query = query.eq('call_type', type);

        const { data, error } = await query;
        if (error) throw error;

        // Client-side search (since we need to search across joined fields)
        consultations = (data || []).filter(c => {
            if (!search) return true;
            const clientName = (c.client?.full_name || '').toLowerCase();
            const clientEmail = (c.client?.email || '').toLowerCase();
            const jobRole = (c.job_role || '').toLowerCase();
            const guidanceTopic = (c.guidance_topic || '').toLowerCase();
            return clientName.includes(search) || clientEmail.includes(search) ||
                   jobRole.includes(search) || guidanceTopic.includes(search);
        });

        renderTable();
    } catch (error) {
        console.error('Error loading consultations:', error);
        tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 2rem; color: red;">Error: ${error.message}</td></tr>`;
    }
};

// Load stats
window.loadStats = async function() {
    try {
        await getAdminUser();

        const { count: total, error: e1 } = await supabase
            .from('consultation_request')
            .select('*', { count: 'exact', head: true });
        const { count: pending, error: e2 } = await supabase
            .from('consultation_request')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'pending');
        const { count: scheduled, error: e3 } = await supabase
            .from('consultation_request')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'scheduled');
        const { count: completed, error: e4 } = await supabase
            .from('consultation_request')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'completed');
        const { count: noShow, error: e5 } = await supabase
            .from('consultation_request')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'no_show');
        const { count: blocked, error: e6 } = await supabase
            .from('consultation_request')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'blocked');

        document.getElementById('statTotal').textContent = total || 0;
        document.getElementById('statPending').textContent = pending || 0;
        document.getElementById('statScheduled').textContent = scheduled || 0;
        document.getElementById('statCompleted').textContent = completed || 0;
        document.getElementById('statNoShow').textContent = noShow || 0;
        document.getElementById('statBlocked').textContent = blocked || 0;
    } catch (error) {
        console.error('Error loading stats:', error);
    }
};

function renderTable() {
    const tbody = document.getElementById('consultationsTable');

    if (!consultations || consultations.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 2rem;">No consultations found</td></tr>';
        return;
    }

    tbody.innerHTML = '';
    consultations.forEach(c => {
        const row = document.createElement('tr');
        const scheduledDate = c.scheduled_at ? new Date(c.scheduled_at).toLocaleString() : '-';

        // Build display values
        const callTypeLabels = { guidance: 'Guidance Call', freelance_request: 'Freelance Request' };
        const statusLabels = {
            pending: 'Pending', scheduled: 'Scheduled', completed: 'Completed',
            no_show: 'No Show', rescheduled: 'Rescheduled', blocked: 'Blocked', cancelled: 'Cancelled'
        };
        const projectLengthLabels = {
            less_than_1_week: '< 1 week', '1_2_weeks': '1-2 weeks', '1_month': '1 month',
            '1_3_months': '1-3 months', '3_6_months': '3-6 months', '6_plus_months': '6+ months',
            ongoing: 'Ongoing', not_sure: 'Not Sure'
        };

        let details = '';
        if (c.call_type === 'guidance') {
            details = c.guidance_topic || 'N/A';
        } else {
            details = `${c.job_role || 'N/A'} | ${projectLengthLabels[c.project_length] || c.project_length || 'N/A'}`;
        }

        let actions = '';
        if (c.status === 'pending') {
            actions = `<button class="btn-small btn-schedule" onclick="openSchedule('${c.id}')">Schedule</button>`;
        } else if (c.status === 'scheduled' || c.status === 'rescheduled') {
            actions = `
                <button class="btn-small btn-complete" onclick="openComplete('${c.id}')">Complete</button>
                <button class="btn-small btn-noshow" onclick="openNoShow('${c.id}')">No Show</button>
            `;
        }
        actions += `<button class="btn-small btn-notes" onclick="openNotes('${c.id}')">Notes</button>`;

        row.innerHTML = `
            <td><strong>${escapeHtml(c.client?.full_name)}</strong><br><small>${escapeHtml(c.client?.email)}</small></td>
            <td><span class="status-badge ${c.call_type}">${callTypeLabels[c.call_type] || c.call_type}</span></td>
            <td>${escapeHtml(details)}</td>
            <td><span class="status-badge ${c.status}">${statusLabels[c.status] || c.status}</span></td>
            <td>${scheduledDate}</td>
            <td>${c.no_show_count || 0}/2</td>
            <td><div class="actions">${actions}</div></td>
        `;
        tbody.appendChild(row);
    });
}

// Schedule modal
window.openSchedule = async function(id) {
    currentConsultationId = id;
    selectedSlotId = null;
    const consultation = consultations.find(c => c.id === id);
    if (!consultation) return;

    document.getElementById('scheduleDetail').innerHTML = `
        <p><strong>Client:</strong> ${escapeHtml(consultation.client?.full_name)} (${consultation.client?.email})</p>
        <p><strong>Type:</strong> ${consultation.call_type === 'guidance' ? 'Guidance Call' : 'Freelance Request'}</p>
        <p><strong>Details:</strong> ${consultation.call_type === 'guidance' ? escapeHtml(consultation.guidance_topic) : escapeHtml(consultation.job_role)}</p>
    `;

    // Load available slots
    const slotsContainer = document.getElementById('availableSlots');
    slotsContainer.innerHTML = '<p>Loading slots...</p>';
    document.getElementById('confirmScheduleBtn').disabled = true;

    try {
        const { data: slots, error } = await supabase
            .from('consultation_slot')
            .select('*')
            .eq('is_booked', false)
            .gt('scheduled_at', new Date().toISOString())
            .order('scheduled_at', { ascending: true })
            .limit(50);
        if (error) throw error;

        availableSlots = slots || [];

        if (availableSlots.length === 0) {
            slotsContainer.innerHTML = '<p>No available slots. Please create slots first.</p>';
            return;
        }

        slotsContainer.innerHTML = '';
        availableSlots.forEach(slot => {
            const slotDate = new Date(slot.scheduled_at);
            const div = document.createElement('div');
            div.className = 'slot-option';
            div.dataset.slotId = slot.id;
            div.innerHTML = `
                <div style="font-weight: 600;">${slotDate.toLocaleDateString()}</div>
                <div style="font-size: 0.9rem;">${slotDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>
            `;
            div.addEventListener('click', () => {
                document.querySelectorAll('.slot-option').forEach(s => s.classList.remove('selected'));
                div.classList.add('selected');
                selectedSlotId = slot.id;
                document.getElementById('confirmScheduleBtn').disabled = false;
            });
            slotsContainer.appendChild(div);
        });
    } catch (error) {
        slotsContainer.innerHTML = `<p style="color: red;">Error loading slots: ${error.message}</p>`;
    }

    document.getElementById('scheduleModal').classList.add('active');
};

window.confirmSchedule = async function() {
    if (!selectedSlotId || !currentConsultationId) return;

    try {
        // 1. Get the selected slot time
        const slot = availableSlots.find(s => s.id === selectedSlotId);
        if (!slot) throw new Error('Slot not found');

        // 2. Free up old slot if one was assigned
        const consultation = consultations.find(c => c.id === currentConsultationId);
        if (consultation?.scheduled_slot_id) {
            const { error: freeError } = await supabase
                .from('consultation_slot')
                .update({ is_booked: false })
                .eq('id', consultation.scheduled_slot_id);
            if (freeError) console.warn('Failed to free old slot:', freeError);
        }

        // 3. Mark new slot as booked
        const { error: slotError } = await supabase
            .from('consultation_slot')
            .update({ is_booked: true })
            .eq('id', selectedSlotId);
        if (slotError) throw slotError;

        // 4. Update consultation
        const { error: consultError } = await supabase
            .from('consultation_request')
            .update({
                scheduled_slot_id: selectedSlotId,
                status: 'scheduled',
                scheduled_at: slot.scheduled_at
            })
            .eq('id', currentConsultationId);
        if (consultError) throw consultError;

        // 5. Notify client
        const { error: notifError } = await supabase
            .from('notification')
            .insert({
                user_id: consultation.client_id,
                type: 'consultation_scheduled',
                message: `Your call has been scheduled for ${new Date(slot.scheduled_at).toLocaleString()}. We will send you the meeting link shortly.`,
                read: false
            });
        if (notifError) console.warn('Notification failed:', notifError);

        closeModal('scheduleModal');
        alert('Call scheduled successfully!');
        loadConsultations();
        loadStats();
    } catch (error) {
        alert('Failed to schedule: ' + error.message);
    }
};

// Complete modal
window.openComplete = function(id) {
    currentConsultationId = id;
    const consultation = consultations.find(c => c.id === id);
    if (!consultation) return;

    document.getElementById('completeDetail').innerHTML = `
        <p><strong>Client:</strong> ${escapeHtml(consultation.client?.full_name)}</p>
        <p><strong>Type:</strong> ${consultation.call_type === 'guidance' ? 'Guidance Call' : 'Freelance Request'}</p>
        <p><strong>Scheduled:</strong> ${consultation.scheduled_at ? new Date(consultation.scheduled_at).toLocaleString() : 'N/A'}</p>
    `;

    document.getElementById('callSummary').value = consultation.call_summary || '';
    document.getElementById('adminNotes').value = consultation.admin_notes || '';

    document.getElementById('completeModal').classList.add('active');
};

window.confirmComplete = async function() {
    try {
        const { error } = await supabase
            .from('consultation_request')
            .update({
                status: 'completed',
                completed_at: new Date().toISOString(),
                call_summary: document.getElementById('callSummary').value,
                admin_notes: document.getElementById('adminNotes').value
            })
            .eq('id', currentConsultationId);
        if (error) throw error;

        // Notify client
        const consultation = consultations.find(c => c.id === currentConsultationId);
        if (consultation) {
            const { error: notifError } = await supabase
                .from('notification')
                .insert({
                    user_id: consultation.client_id,
                    type: 'consultation_completed',
                    message: 'Your consultation call has been completed. Thank you for choosing Tasknory!',
                    read: false
                });
            if (notifError) console.warn('Notification failed:', notifError);
        }

        closeModal('completeModal');
        alert('Call marked as completed!');
        loadConsultations();
        loadStats();
    } catch (error) {
        alert('Failed: ' + error.message);
    }
};

// No Show modal
window.openNoShow = function(id) {
    currentConsultationId = id;
    const consultation = consultations.find(c => c.id === id);
    if (!consultation) return;

    document.getElementById('noShowDetail').innerHTML = `
        <p><strong>Client:</strong> ${escapeHtml(consultation.client?.full_name)}</p>
        <p><strong>Scheduled:</strong> ${consultation.scheduled_at ? new Date(consultation.scheduled_at).toLocaleString() : 'N/A'}</p>
        <p><strong>Current No Shows:</strong> ${consultation.no_show_count || 0}/2</p>
    `;

    const warning = (consultation.no_show_count || 0) >= 1 
        ? 'This is their 2nd no-show. They will be blocked for 24 hours.'
        : 'This is their 1st no-show. They will be automatically rescheduled.';
    document.getElementById('noShowWarning').textContent = warning;

    document.getElementById('noShowModal').classList.add('active');
};

window.confirmNoShow = async function() {
    try {
        const consultation = consultations.find(c => c.id === currentConsultationId);
        if (!consultation) throw new Error('Consultation not found');

        const newNoShowCount = (consultation.no_show_count || 0) + 1;

        if (newNoShowCount >= 2) {
            // Block client for 24 hours
            const blockedUntil = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
            const { error } = await supabase
                .from('consultation_request')
                .update({
                    status: 'blocked',
                    no_show_count: newNoShowCount,
                    blocked_until: blockedUntil
                })
                .eq('id', currentConsultationId);
            if (error) throw error;

            // Free up the slot
            if (consultation.scheduled_slot_id) {
                await supabase
                    .from('consultation_slot')
                    .update({ is_booked: false })
                    .eq('id', consultation.scheduled_slot_id);
            }

            // Notify client
            const { error: notifError } = await supabase
                .from('notification')
                .insert({
                    user_id: consultation.client_id,
                    type: 'consultation_blocked',
                    message: 'You have missed two scheduled calls. You are blocked from booking new calls for 24 hours.',
                    read: false
                });
            if (notifError) console.warn('Notification failed:', notifError);

            alert('Client blocked for 24 hours due to repeated no-shows.');
        } else {
            // First no-show: auto-reschedule
            const { error } = await supabase
                .from('consultation_request')
                .update({
                    status: 'rescheduled',
                    no_show_count: newNoShowCount,
                    scheduled_slot_id: null,
                    scheduled_at: null
                })
                .eq('id', currentConsultationId);
            if (error) throw error;

            // Free up the current slot
            if (consultation.scheduled_slot_id) {
                await supabase
                    .from('consultation_slot')
                    .update({ is_booked: false })
                    .eq('id', consultation.scheduled_slot_id);
            }

            // Notify client
            const { error: notifError } = await supabase
                .from('notification')
                .insert({
                    user_id: consultation.client_id,
                    type: 'consultation_rescheduled',
                    message: 'You missed your scheduled call. We have automatically rescheduled you. Please check your dashboard for the new time.',
                    read: false
                });
            if (notifError) console.warn('Notification failed:', notifError);

            alert('No-show recorded. Client has been automatically rescheduled.');
        }

        closeModal('noShowModal');
        loadConsultations();
        loadStats();
    } catch (error) {
        alert('Failed: ' + error.message);
    }
};

// Notes modal
window.openNotes = async function(id) {
    const consultation = consultations.find(c => c.id === id);
    if (!consultation) return;
    const notes = consultation.admin_notes || 'No notes yet.';
    const summary = consultation.call_summary || 'No summary yet.';

    alert(`Notes for ${consultation.client?.full_name || 'Client'}:

Admin Notes: ${notes}

Call Summary: ${summary}`);
};

window.closeModal = function(modalId) {
    document.getElementById(modalId).classList.remove('active');
    currentConsultationId = null;
    selectedSlotId = null;
};

function escapeHtml(text) {
    if (!text) return 'N/A';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Filter change listeners
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('filterStatus').addEventListener('change', loadConsultations);
    document.getElementById('filterType').addEventListener('change', loadConsultations);
    document.getElementById('searchInput').addEventListener('input', debounce(loadConsultations, 300));
    loadConsultations();
    loadStats();
});

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}