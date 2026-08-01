// Import the global Supabase client + helpers
import { supabase, getCurrentUser, uploadFile, STORAGE_BASE } from '../api.js';

document.addEventListener("DOMContentLoaded", async () => {
    await loadSettings();

    const settingsForm = document.getElementById("clientSettingsForm");
    if (settingsForm) {
        settingsForm.addEventListener("submit", saveSettings);
    }

    const profileInput = document.getElementById("profile_picture");
    if (profileInput) {
        profileInput.addEventListener("change", (e) => {
            const file = e.target.files[0];
            if (file) {
                document.getElementById("profilePreview").src = URL.createObjectURL(file);
            }
        });
    }

    const uploadIdBtn = document.getElementById("uploadIdBtn");
    if (uploadIdBtn) {
        uploadIdBtn.addEventListener("click", async () => {
            await uploadGovernmentID();
        });
    }
});

async function loadSettings() {
    try {
        const user = await getCurrentUser();
        if (!user) {
            alert("You must be logged in");
            window.location.href = "login.html";
            return;
        }

        const fullNameEl = document.getElementById("full_name");
        const businessNameEl = document.getElementById("business_name");
        const emailEl = document.getElementById("email");
        const accountNumberEl = document.getElementById("account_number");
        const languageEl = document.getElementById("language");
        const toneEl = document.getElementById("tone");

        if (fullNameEl) fullNameEl.value = user.full_name || "";
        if (businessNameEl) businessNameEl.value = user.business_name || "";
        if (emailEl) emailEl.value = user.email || "";
        if (accountNumberEl) accountNumberEl.value = user.account_number || "";
        if (languageEl) languageEl.value = user.language || "English";
        if (toneEl) toneEl.value = user.tone || "professional";

        await loadVerificationStatus(user);

        const avatar = document.getElementById("profilePreview");
        if (avatar) {
            if (user.profile_picture) {
                // If it's already a full URL, use it. If it's a storage path, construct the URL.
                let picUrl = user.profile_picture;
                if (!picUrl.startsWith('http')) {
                    picUrl = `${STORAGE_BASE}/profile_pics/${picUrl}`;
                }
                avatar.src = picUrl;
            } else {
                avatar.src = "../assets/images/default-avatar.png";
            }
        }

        const accountTypeDisplay = document.getElementById("accountTypeDisplay");
        if (accountTypeDisplay) {
            if (user.business_name) {
                accountTypeDisplay.innerHTML = `
                    <span class="badge business-badge">🏢 Business Account</span>
                    <small>${user.business_name}</small>
                `;
            } else {
                accountTypeDisplay.innerHTML = `
                    <span class="badge individual-badge">👤 Individual Account</span>
                `;
            }
        }
    } catch (error) {
        console.error("Error loading settings:", error);
        alert("You must be logged in");
    }
}

async function loadVerificationStatus(user) {
    const statusElement = document.getElementById("verificationStatus");
    const uploadBtn = document.getElementById("uploadIdBtn");
    const govIdInput = document.getElementById("gov_id");

    if (!statusElement) return;

    if (user.id_verified) {
        statusElement.innerHTML = `
            <div class="status-approved">
                <span class="status-icon">✅</span>
                <span class="status-text">Verified & Ready to Post Jobs</span>
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
                <span class="status-text">ID Verification Required to Post Jobs</span>
                <small>Upload your government ID or business license to get verified</small>
            </div>
        `;
    }
}

async function uploadGovernmentID() {
    const fileInput = document.getElementById("gov_id");
    const file = fileInput?.files[0];
    if (!file) {
        alert("Please select a government ID or business license file to upload.");
        return;
    }

    const uploadBtn = document.getElementById("uploadIdBtn");
    const originalText = uploadBtn ? uploadBtn.textContent : "Upload ID";

    try {
        if (uploadBtn) {
            uploadBtn.disabled = true;
            uploadBtn.textContent = "Uploading...";
        }

        const user = await getCurrentUser();
        if (!user) return;

        // 1. Upload file to Supabase Storage (private bucket)
        const filePath = `${user.id}/${Date.now()}_${file.name}`;
        const publicUrl = await uploadFile('id_verifications', filePath, file);

        // 2. Update user profile with the path
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
        await loadSettings();

    } catch (error) {
        console.error("ID upload failed:", error);
        alert("ID upload failed: " + (error.message || error));
    } finally {
        if (uploadBtn) {
            uploadBtn.disabled = false;
            uploadBtn.textContent = originalText;
        }
    }
}

async function saveSettings(event) {
    event.preventDefault();

    try {
        const user = await getCurrentUser();
        if (!user) return;

        const fullName = document.getElementById("full_name")?.value;
        const businessName = document.getElementById("business_name")?.value;
        const language = document.getElementById("language")?.value;
        const tone = document.getElementById("tone")?.value;
        const profileFile = document.getElementById("profile_picture")?.files[0];

        // Handle profile picture upload first
        if (profileFile) {
            const filePath = `${user.id}/${Date.now()}_${profileFile.name}`;
            const publicUrl = await uploadFile('profile_pics', filePath, profileFile);

            // Update profile picture URL
            const { error: picError } = await supabase
                .from('users')
                .update({ profile_picture: publicUrl })
                .eq('id', user.id);
            if (picError) throw picError;
        }

        // Update other profile fields
        const updateData = {
            full_name: fullName,
            business_name: businessName || null,
            language: language,
            tone: tone
        };

        const { error: updateError } = await supabase
            .from('users')
            .update(updateData)
            .eq('id', user.id);
        if (updateError) throw updateError;

        alert("Settings updated successfully!");
        await loadSettings();

    } catch (error) {
        console.error("Save settings error:", error);
        alert("Update failed: " + (error.message || error));
    }
}