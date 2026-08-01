import { supabase, getCurrentUser } from './api.js';

let selectedCallType = null;
let selectedSlot = null;
let availableSlots = [];

// Call type selection
window.selectCallType = function(type) {
    selectedCallType = type;
    document.querySelectorAll('.call-type-card').forEach(card => {
        card.classList.remove('selected');
    });
    document.querySelector(`[data-type="${type}"]`).classList.add('selected');
    document.getElementById('step1Next').disabled = false;
};

// Navigation
window.goToStep = function(step) {
    document.querySelectorAll('.form-section').forEach(section => {
        section.classList.remove('active');
    });
    document.getElementById(`step${step}`).classList.add('active');

    // Update step indicators
    document.querySelectorAll('.step-dot').forEach((dot, index) => {
        dot.classList.remove('active', 'completed');
        if (index < step - 1) dot.classList.add('completed');
        if (index === step - 1) dot.classList.add('active');
    });
};

window.goToStep2 = function() {
    if (!selectedCallType) return;

    document.getElementById('guidanceForm').style.display = selectedCallType === 'guidance' ? 'block' : 'none';
    document.getElementById('freelanceForm').style.display = selectedCallType === 'freelance_request' ? 'block' : 'none';

    goToStep(2);
    validateStep2();
};

window.goToStep3 = function() {
    if (!validateStep2()) return;
    goToStep(3);
    loadAvailableSlots();
};

// Validation
function validateStep2() {
    let isValid = false;

    if (selectedCallType === 'guidance') {
        const topic = document.getElementById('guidanceTopic').value.trim();
        const challenge = document.getElementById('currentChallenge').value.trim();
        isValid = topic && challenge;
    } else {
        const role = document.getElementById('jobRole').value.trim();
        const length = document.getElementById('projectLength').value;
        const commitment = document.getElementById('commitmentLevel').value;
        isValid = role && length && commitment;
    }

    document.getElementById('step2Next').disabled = !isValid;
    return isValid;
}

// Add input listeners for validation
document.addEventListener('DOMContentLoaded', () => {
    const inputs = ['guidanceTopic', 'currentChallenge', 'jobRole', 'projectLength', 'commitmentLevel'];
    inputs.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('input', validateStep2);
            el.addEventListener('change', validateStep2);
        }
    });
});

// Load available slots
async function loadAvailableSlots() {
    const loadingEl = document.getElementById('slotsLoading');
    const containerEl = document.getElementById('slotsContainer');
    const noSlotsEl = document.getElementById('noSlotsMessage');

    loadingEl.style.display = 'block';
    containerEl.style.display = 'none';
    noSlotsEl.style.display = 'none';

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
        loadingEl.style.display = 'none';

        if (!availableSlots || availableSlots.length === 0) {
            noSlotsEl.style.display = 'block';
            return;
        }

        containerEl.innerHTML = '';
        containerEl.style.display = 'grid';

        availableSlots.forEach(slot => {
            const slotDate = new Date(slot.scheduled_at);
            const card = document.createElement('div');
            card.className = 'slot-card';
            card.dataset.slotId = slot.id;
            card.innerHTML = `
                <div class="day">${slotDate.toLocaleDateString('en-US', { weekday: 'short' })}</div>
                <div class="date">${slotDate.getDate()}</div>
                <div class="time">${slotDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</div>
                <div style="font-size: 0.8rem; color: var(--text-secondary, #666); margin-top: 0.5rem;">
                    ${slotDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                </div>
            `;
            card.addEventListener('click', () => selectSlot(slot.id, card));
            containerEl.appendChild(card);
        });

    } catch (error) {
        console.error('Error loading slots:', error);
        loadingEl.style.display = 'none';
        showError('Failed to load available slots. Please try again.');
    }
}

function selectSlot(slotId, cardElement) {
    selectedSlot = slotId;
    document.querySelectorAll('.slot-card').forEach(card => {
        card.classList.remove('selected');
    });
    cardElement.classList.add('selected');
    document.getElementById('submitBtn').disabled = false;
}

// Submit booking
window.submitBooking = async function() {
    if (!selectedCallType || !selectedSlot) return;

    const submitBtn = document.getElementById('submitBtn');
    submitBtn.disabled = true;
    submitBtn.innerHTML = 'Submitting<span class="loading-spinner"></span>';

    try {
        const user = await getCurrentUser();
        if (!user) throw new Error('You must be logged in to book a call.');

        // 1. Check if client is blocked
        const { data: blockedRequests, error: blockError } = await supabase
            .from('consultation_request')
            .select('blocked_until')
            .eq('client_id', user.id)
            .eq('status', 'blocked')
            .gt('blocked_until', new Date().toISOString());
        if (blockError) throw blockError;
        if (blockedRequests && blockedRequests.length > 0) {
            const blocked = blockedRequests[0];
            throw new Error(`You are blocked from booking calls until ${new Date(blocked.blocked_until).toLocaleString()}.`);
        }

        const slot = availableSlots.find(s => s.id === selectedSlot);
        if (!slot) throw new Error('Selected slot no longer available.');

        // 2. Build payload
        const payload = {
            client_id: user.id,
            call_type: selectedCallType,
            preferred_time_start: slot.scheduled_at,
            scheduled_slot_id: slot.id,
            status: 'pending'
        };

        if (selectedCallType === 'guidance') {
            payload.guidance_topic = document.getElementById('guidanceTopic').value.trim();
            payload.current_challenge = document.getElementById('currentChallenge').value.trim();
        } else {
            payload.job_role = document.getElementById('jobRole').value.trim();
            payload.project_length = document.getElementById('projectLength').value;
            payload.commitment_level = document.getElementById('commitmentLevel').value;
            payload.tech_stack = document.getElementById('techStack').value.trim();
            payload.project_description = document.getElementById('projectDescription').value.trim();
        }

        // 3. Mark slot as booked
        const { error: slotError } = await supabase
            .from('consultation_slot')
            .update({ is_booked: true })
            .eq('id', slot.id);
        if (slotError) throw slotError;

        // 4. Insert consultation request
        const { error: reqError } = await supabase
            .from('consultation_request')
            .insert(payload);
        if (reqError) throw reqError;

        // 5. Send notification to client (best effort — may fail due to RLS)
        await supabase.from('notification').insert({
            user_id: user.id,
            type: 'consultation_submitted',
            message: `Your ${selectedCallType === 'guidance' ? 'Guidance Call' : 'Freelance Request Call'} request has been submitted. We will schedule your call soon.`,
            read: false
        }).catch(err => console.warn('Client notification failed:', err));

        // 6. Send notification to admins (best effort — may fail due to RLS)
        const { data: admins, error: adminError } = await supabase
            .from('users')
            .select('id')
            .eq('role', 'admin');
        if (!adminError && admins) {
            const adminNotifications = admins.map(admin => ({
                user_id: admin.id,
                type: 'new_consultation',
                message: `New consultation request from ${user.full_name} (${selectedCallType === 'guidance' ? 'Guidance Call' : 'Freelance Request Call'}).`,
                read: false
            }));
            await supabase.from('notification').insert(adminNotifications)
                .catch(err => console.warn('Admin notification failed:', err));
        }

        // Show success
        document.querySelectorAll('.form-section').forEach(section => {
            section.classList.remove('active');
        });
        document.getElementById('successScreen').classList.add('active');

    } catch (error) {
        console.error('Booking error:', error);
        showError(error.message || 'Failed to book call. Please try again.');
        submitBtn.disabled = false;
        submitBtn.innerHTML = 'Book My Call';
    }
};

function showError(message) {
    const errorEl = document.getElementById('errorMessage');
    errorEl.textContent = message;
    errorEl.classList.add('show');
    setTimeout(() => {
        errorEl.classList.remove('show');
    }, 5000);
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