// settings.js — SUPABASE VERSION
import { supabase, getCurrentUser, uploadFile } from '../api.js';

document.addEventListener("DOMContentLoaded", async () => {
    await loadSettings();

    const settingsForm = document.getElementById("freelancerSettingsForm");
    if (settingsForm) settingsForm.addEventListener("submit", saveSettings);

    // Preview profile picture instantly
    const profileInput = document.getElementById("profile_picture");
    if (profileInput) {
        profileInput.addEventListener("change", (e) => {
            const file = e.target.files[0];
            if (file) {
                document.getElementById("profilePreview").src = URL.createObjectURL(file);
            }
        });
    }

    // ID Upload functionality
    const uploadIdBtn = document.getElementById("uploadIdBtn");
    if (uploadIdBtn) {
        uploadIdBtn.addEventListener("click", async () => {
            await uploadGovernmentID();
        });
    }
});

// Load user data
async function loadSettings() {
    try {
        const user = await getCurrentUser();
        if (!user) return;

        // Populate basic info
        const fullNameEl = document.getElementById("full_name");
        const emailEl = document.getElementById("email");
        const accountNumberEl = document.getElementById("account_number");
        const languageEl = document.getElementById("language");
        const toneEl = document.getElementById("tone");
        const rateBeginEl = document.getElementById("rate_begin");
        const rateEndEl = document.getElementById("rate_end");

        if (fullNameEl) fullNameEl.value = user.full_name || "";
        if (emailEl) emailEl.value = user.email || "";
        if (accountNumberEl) accountNumberEl.value = user.account_number || "";
        if (languageEl) languageEl.value = user.language || "English";
        if (toneEl) toneEl.value = user.tone || "professional";
        if (rateBeginEl) rateBeginEl.value = user.rate_begin || "";
        if (rateEndEl) rateEndEl.value = user.rate_end || "";

        // Load verification status
        await loadVerificationStatus(user);

        // Load badges
        const badgesDiv = document.getElementById("badgesDisplay");
        if (badgesDiv) {
            badgesDiv.innerHTML = "";

            if (user.main_badge?.name) {
                badgesDiv.innerHTML += `<span class="badge main-badge">${user.main_badge.name}</span>`;
            }
            if (user.tasknory_choice) {
                badgesDiv.innerHTML += `<span class="badge special-badge">Tasknory Choice</span>`;
            }
            if (user.tasknory_partner) {
                badgesDiv.innerHTML += `<span class="badge special-badge">Tasknory Partner</span>`;
            }
            if (Array.isArray(user.achievements)) {
                user.achievements.forEach(ach => {
                    badgesDiv.innerHTML += `<span class="badge achievement-badge">${ach}</span>`;
                });
            }
        }

        // Load profile picture
        const avatar = document.getElementById("profilePreview");
        if (avatar) {
            if (user.profile_picture) {
                avatar.src = user.profile_picture;
            } else {
                avatar.src = "../assets/images/default-avatar.png";
            }
        }
    } catch (error) {
        console.error("Error loading settings:", error);
        alert("You must be logged in");
    }
}

// Load verification status
async function loadVerificationStatus(user) {
    const statusElement = document.getElementById("verificationStatus");
    const uploadBtn = document.getElementById("uploadIdBtn");
    const govIdInput = document.getElementById("gov_id");

    if (!statusElement) return;

    if (user.id_verified) {
        statusElement.innerHTML = `
            <div class="status-approved">
                <span class="status-icon">✅</span>
                <span class="status-text">Verified & Ready to Work</span>
            </div>
        `;
        if (uploadBtn) uploadBtn.style.display = 'none';
        if (govIdInput) govIdInput.style.display = 'none';
    } else if (user.gov_id_path) {
        statusElement.innerHTML = `
            <div class="status-pending">
                <span class="status-icon">⏳</span>
                <span class="status-text">ID Uploaded - Awaiting Admin Approval</span>
            </div>
        `;
        if (uploadBtn) {
            uploadBtn.disabled = true;
            uploadBtn.textContent = "ID Submitted - Pending Approval";
        }
    } else if (user.id_rejection_reason) {
        statusElement.innerHTML = `
            <div class="status-rejected">
                <span class="status-icon">❌</span>
                <span class="status-text">ID Rejected: ${user.id_rejection_reason}</span>
                <small>Please upload a new ID document</small>
            </div>
        `;
    } else {
        statusElement.innerHTML = `
            <div class="status-required">
                <span class="status-icon">📋</span>
                <span class="status-text">ID Verification Required to Start Working</span>
                <small>Upload your government ID to get verified</small>
            </div>
        `;
    }
}

// Upload government ID to Supabase Storage
async function uploadGovernmentID() {
    const fileInput = document.getElementById("gov_id");
    const file = fileInput?.files[0];
    if (!file) {
        alert("Please select a government ID file to upload.");
        return;
    }

    const uploadBtn = document.getElementById("uploadIdBtn");
    const originalText = uploadBtn?.textContent;
    if (uploadBtn) {
        uploadBtn.disabled = true;
        uploadBtn.textContent = "Uploading...";
    }

    try {
        const user = await getCurrentUser();
        if (!user) throw new Error("Not authenticated");

        const filePath = `${user.id}/${Date.now()}_${file.name}`;

        // Upload to private bucket
        const { error: uploadError } = await supabase.storage
            .from('id_verifications')
            .upload(filePath, file, { upsert: true });
        if (uploadError) throw uploadError;

        // Update user profile with the storage path
        const { error: updateError } = await supabase
            .from('users')
            .update({
                gov_id_path: filePath,
                id_verified: false,
                id_rejection_reason: ''
            })
            .eq('id', user.id);
        if (updateError) throw updateError;

        alert("✅ ID uploaded successfully! Awaiting admin verification.");
        await loadSettings(); // refresh

    } catch (error) {
        console.error("ID upload failed:", error);
        alert("ID upload failed: " + (error.message || error));
        if (uploadBtn) {
            uploadBtn.disabled = false;
            uploadBtn.textContent = originalText;
        }
    }
}

// Save basic settings
async function saveSettings(event) {
    event.preventDefault();

    try {
        const user = await getCurrentUser();
        if (!user) throw new Error("Not authenticated");

        const fullName = document.getElementById("full_name")?.value;
        const language = document.getElementById("language")?.value;
        const tone = document.getElementById("tone")?.value;
        const profileFile = document.getElementById("profile_picture")?.files[0];
        const rateBegin = document.getElementById("rate_begin")?.value;
        const rateEnd = document.getElementById("rate_end")?.value;

        // Validation
        if (rateBegin && rateEnd && parseFloat(rateBegin) > parseFloat(rateEnd)) {
            alert("Minimum rate cannot be greater than maximum rate.");
            return;
        }
        if ((rateBegin && parseFloat(rateBegin) < 0) || (rateEnd && parseFloat(rateEnd) < 0)) {
            alert("Rates cannot be negative.");
            return;
        }

        // If profile picture selected, upload it to public bucket
        let profilePictureUrl = user.profile_picture;
        if (profileFile) {
            const filePath = `${user.id}/${Date.now()}_${profileFile.name}`;
            profilePictureUrl = await uploadFile('profile_pics', filePath, profileFile);
        }

        // Update user profile
        const updateData = {
            full_name: fullName,
            language: language,
            tone: tone,
            rate_begin: rateBegin ? parseFloat(rateBegin) : null,
            rate_end: rateEnd ? parseFloat(rateEnd) : null,
            profile_picture: profilePictureUrl
        };

        const { error } = await supabase
            .from('users')
            .update(updateData)
            .eq('id', user.id);
        if (error) throw error;

        alert("Settings updated successfully!");
        await loadSettings();

    } catch (error) {
        console.error("Save settings error:", error);
        alert("Update failed: " + (error.message || error));
    }
}