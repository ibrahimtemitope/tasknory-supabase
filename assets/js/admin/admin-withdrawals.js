// admin-withdrawals.js — SUPABASE VERSION
// Import the global Supabase client
import { supabase, getCurrentUser } from '../api.js';

let currentAdmin = null;
let allWithdrawals = [];
let selectedWithdrawals = new Set();

document.addEventListener("DOMContentLoaded", function() {
    initializeAdminWithdrawals();
    setupEventListeners();
});

// NGN Conversion Utility
function formatNGN(tnAmount) {
    if (!tnAmount || tnAmount <= 0) return '₦0';
    const amountNGN = tnAmount * 1600;
    return '₦' + amountNGN.toLocaleString('en-NG');
}

async function initializeAdminWithdrawals() {
    try {
        const user = await getCurrentUser(false); // don't redirect
        if (!user || user.role !== 'admin') {
            alert("Access denied. Admin privileges required.");
            window.location.href = "../dashboard.html";
            return;
        }
        currentAdmin = user;
        await loadWithdrawals();
    } catch (error) {
        console.error("Admin init error:", error);
        alert("You must be logged in to access admin panel.");
        window.location.href = "../login.html";
    }
}

function setupEventListeners() {
    document.getElementById('statusFilter').addEventListener('change', filterWithdrawals);
    document.getElementById('methodFilter').addEventListener('change', filterWithdrawals);
    document.getElementById('dateFilter').addEventListener('change', filterWithdrawals);
    document.getElementById('resetFilters').addEventListener('click', resetFilters);

    document.getElementById('bulkStartProcessing').addEventListener('click', () => bulkAction('processing'));
    document.getElementById('bulkComplete').addEventListener('click', () => bulkAction('completed'));
    document.getElementById('bulkReject').addEventListener('click', showBulkRejectModal);

    document.getElementById('closeActionModal').addEventListener('click', closeActionModal);
    document.getElementById('cancelAction').addEventListener('click', closeActionModal);
    document.getElementById('confirmAction').addEventListener('click', executeAction);

    document.getElementById('closeRejectModal').addEventListener('click', closeRejectModal);
    document.getElementById('cancelReject').addEventListener('click', closeRejectModal);
    document.getElementById('confirmReject').addEventListener('click', executeRejection);

    setupMobileMenu();
}

function setupMobileMenu() {
    const mobileMenuBtn = document.getElementById("mobileMenuBtn");
    const sidebar = document.getElementById("sidebar");
    if (mobileMenuBtn && sidebar) {
        mobileMenuBtn.addEventListener("click", function(e) {
            e.stopPropagation();
            sidebar.classList.toggle("mobile-open");
            mobileMenuBtn.classList.toggle("active");
        });
        document.addEventListener("click", function(e) {
            if (sidebar.classList.contains("mobile-open")) {
                if (!sidebar.contains(e.target) && e.target !== mobileMenuBtn && !mobileMenuBtn.contains(e.target)) {
                    sidebar.classList.remove("mobile-open");
                    mobileMenuBtn.classList.remove("active");
                }
            }
        });
        sidebar.addEventListener("click", function(e) { e.stopPropagation(); });
        document.querySelectorAll('.nav-link').forEach(link => {
            link.addEventListener('click', () => {
                sidebar.classList.remove("mobile-open");
                mobileMenuBtn.classList.remove("active");
            });
        });
    }
}

async function loadWithdrawals() {
    const container = document.getElementById("withdrawalsList");
    container.innerHTML = "<div class='loading'>Loading withdrawal requests...</div>";

    try {
        const { data: withdrawals, error } = await supabase
            .from('withdrawal_request')
            .select(`
                *,
                user:user_id(full_name, username, email)
            `)
            .order('created_at', { ascending: false });
        if (error) throw error;

        allWithdrawals = withdrawals || [];
        displayWithdrawals(allWithdrawals);
    } catch (error) {
        console.error("Error loading withdrawals:", error);
        container.innerHTML = "<p class='error'>Error loading withdrawal requests.</p>";
    }
}

function displayWithdrawals(withdrawals) {
    const container = document.getElementById("withdrawalsList");

    if (!withdrawals || withdrawals.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <h3>No withdrawal requests found</h3>
                <p>There are no withdrawal requests matching your current filters.</p>
            </div>
        `;
        return;
    }

    // Update stats
    const counts = { pending: 0, processing: 0, completed: 0, rejected: 0, cancelled: 0 };
    let totalToday = 0;
    const today = new Date().toISOString().split('T')[0];
    withdrawals.forEach(w => {
        counts[w.status] = (counts[w.status] || 0) + 1;
        if (w.status === 'completed' && w.processed_at && w.processed_at.startsWith(today)) {
            totalToday += parseFloat(w.amount);
        }
    });
    document.getElementById('pendingCount').textContent = counts.pending || 0;
    document.getElementById('processingCount').textContent = counts.processing || 0;
    document.getElementById('completedCount').textContent = counts.completed || 0;
    document.getElementById('totalAmount').textContent = `${totalToday} TN`;

    let html = '';
    withdrawals.forEach(withdrawal => {
        const isSelected = selectedWithdrawals.has(withdrawal.id);
        const userName = withdrawal.account_details?.account_name || withdrawal.user?.full_name || withdrawal.user?.username || 'Unknown';

        html += `
            <div class="withdrawal-item ${isSelected ? 'selected' : ''}" data-withdrawal-id="${withdrawal.id}">
                <div class="withdrawal-header">
                    <div>
                        <div class="withdrawal-id">#${withdrawal.id.substring(0, 8)}</div>
                        <div class="withdrawal-user">
                            ${userName}
                        </div>
                    </div>
                    <div style="text-align: right;">
                        <div class="status-badge status-${withdrawal.status}">
                            ${withdrawal.status.charAt(0).toUpperCase() + withdrawal.status.slice(1)}
                        </div>
                        <div style="margin-top: 0.5rem; font-size: 0.9rem; color: var(--text-muted);">
                            ${new Date(withdrawal.created_at).toLocaleDateString()}
                        </div>
                    </div>
                </div>

                <div class="withdrawal-details">
                    <div class="detail-group">
                        <h4>Transaction Details</h4>
                        <p><strong>Amount:</strong> ${withdrawal.amount} TN (${formatNGN(withdrawal.amount)})</p>
                        <p><strong>Fee:</strong> ${withdrawal.fee} TN (${formatNGN(withdrawal.fee)})</p>
                        <p><strong>Total Deducted:</strong> ${withdrawal.total_deducted} TN (${formatNGN(withdrawal.total_deducted)})</p>
                        <p><strong>Method:</strong> ${withdrawal.payment_method === 'bank' ? '🏦 Bank Transfer' : '🌐 USDT Crypto'}</p>
                    </div>

                    <div class="detail-group">
                        <h4>Recipient Details</h4>
                        <div class="account-details">
                            ${withdrawal.payment_method === 'bank' ? `
                                <p><strong>Bank:</strong> ${withdrawal.account_details?.bank_name || ''}</p>
                                <p><strong>Account:</strong> ${withdrawal.account_details?.account_number || ''}</p>
                                <p><strong>Name:</strong> ${withdrawal.account_details?.account_name || ''}</p>
                            ` : `
                                <p><strong>Network:</strong> ${withdrawal.account_details?.crypto_network || 'BEP-20'}</p>
                                <p><strong>Address:</strong> ${withdrawal.account_details?.crypto_address || ''}</p>
                            `}
                        </div>
                    </div>
                </div>

                ${withdrawal.admin_notes ? `
                    <div class="admin-notes">
                        <h4>Admin Notes</h4>
                        <p>${withdrawal.admin_notes}</p>
                    </div>
                ` : ''}

                <div class="action-buttons">
                    <div>
                        <input type="checkbox" class="withdrawal-checkbox" data-withdrawal-id="${withdrawal.id}" 
                               ${isSelected ? 'checked' : ''} onchange="toggleWithdrawalSelection('${withdrawal.id}')">
                        <label>Select</label>
                    </div>

                    <div style="margin-left: auto;">
                        ${withdrawal.status === 'pending' ? `
                            <button class="btn btn-primary btn-sm start-processing" data-withdrawal-id="${withdrawal.id}">
                                Start Processing
                            </button>
                            <button class="btn btn-success btn-sm complete-withdrawal" data-withdrawal-id="${withdrawal.id}">
                                Mark Complete
                            </button>
                            <button class="btn btn-danger btn-sm reject-withdrawal" data-withdrawal-id="${withdrawal.id}">
                                Reject
                            </button>
                        ` : ''}

                        ${withdrawal.status === 'processing' ? `
                            <button class="btn btn-success btn-sm complete-withdrawal" data-withdrawal-id="${withdrawal.id}">
                                Mark Complete
                            </button>
                            <button class="btn btn-danger btn-sm reject-withdrawal" data-withdrawal-id="${withdrawal.id}">
                                Reject
                            </button>
                        ` : ''}

                        ${['completed', 'rejected', 'cancelled'].includes(withdrawal.status) ? `
                            <button class="btn btn-outline btn-sm view-details" data-withdrawal-id="${withdrawal.id}">
                                View Details
                            </button>
                        ` : ''}
                    </div>
                </div>
            </div>
        `;
    });

    container.innerHTML = html;

    // Attach event listeners
    container.querySelectorAll('.start-processing').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            startProcessingWithdrawal(btn.dataset.withdrawalId);
        });
    });
    container.querySelectorAll('.complete-withdrawal').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            completeWithdrawal(btn.dataset.withdrawalId);
        });
    });
    container.querySelectorAll('.reject-withdrawal').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            showRejectModal(btn.dataset.withdrawalId);
        });
    });
    container.querySelectorAll('.view-details').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            viewWithdrawalDetails(btn.dataset.withdrawalId);
        });
    });
    container.querySelectorAll('.withdrawal-item').forEach(item => {
        item.addEventListener('click', (e) => {
            if (!e.target.classList.contains('btn') && !e.target.classList.contains('withdrawal-checkbox')) {
                const withdrawalId = item.dataset.withdrawalId;
                toggleWithdrawalSelection(withdrawalId);
            }
        });
    });
}

// Global function for checkbox selection
window.toggleWithdrawalSelection = function(withdrawalId) {
    if (selectedWithdrawals.has(withdrawalId)) {
        selectedWithdrawals.delete(withdrawalId);
    } else {
        selectedWithdrawals.add(withdrawalId);
    }
    updateBulkActionsUI();
    displayWithdrawals(getFilteredWithdrawals());
};

function updateBulkActionsUI() {
    const bulkActions = document.getElementById('bulkActions');
    const selectedCount = document.getElementById('selectedCount');
    if (selectedWithdrawals.size > 0) {
        bulkActions.style.display = 'block';
        selectedCount.textContent = `${selectedWithdrawals.size} selected`;
    } else {
        bulkActions.style.display = 'none';
    }
}

function filterWithdrawals() {
    const filtered = getFilteredWithdrawals();
    displayWithdrawals(filtered);
}

function getFilteredWithdrawals() {
    const statusFilter = document.getElementById('statusFilter').value;
    const methodFilter = document.getElementById('methodFilter').value;
    const dateFilter = document.getElementById('dateFilter').value;
    return allWithdrawals.filter(withdrawal => {
        if (statusFilter !== 'all' && withdrawal.status !== statusFilter) return false;
        if (methodFilter !== 'all' && withdrawal.payment_method !== methodFilter) return false;
        if (dateFilter) {
            const withdrawalDate = new Date(withdrawal.created_at).toISOString().split('T')[0];
            if (withdrawalDate !== dateFilter) return false;
        }
        return true;
    });
}

function resetFilters() {
    document.getElementById('statusFilter').value = 'all';
    document.getElementById('methodFilter').value = 'all';
    document.getElementById('dateFilter').value = '';
    displayWithdrawals(allWithdrawals);
}

async function startProcessingWithdrawal(withdrawalId) {
    try {
        const { error } = await supabase
            .from('withdrawal_request')
            .update({ status: 'processing', processed_at: new Date().toISOString() })
            .eq('id', withdrawalId);
        if (error) throw error;

        alert('✅ Withdrawal marked as processing!');
        await reloadAllData();
    } catch (error) {
        console.error("Error starting processing:", error);
        alert("❌ Failed to update withdrawal status: " + (error.message || error));
    }
}

function executeAction() {
    closeActionModal();
}

async function completeWithdrawal(withdrawalId) {
    const withdrawal = allWithdrawals.find(w => w.id === withdrawalId);
    if (!withdrawal) {
        alert('Withdrawal not found.');
        return;
    }

    const modal = document.getElementById('actionModal');
    const content = document.getElementById('modalContent');
    const userName = withdrawal.account_details?.account_name || withdrawal.user?.full_name || withdrawal.user?.username || 'Unknown';
    content.innerHTML = `
        <p>Are you sure you want to mark this withdrawal as completed?</p>
        <div class="confirmation-details">
            <p><strong>User:</strong> ${userName}</p>
            <p><strong>Amount:</strong> ${withdrawal.amount} TN (${formatNGN(withdrawal.amount)})</p>
            <p><strong>Method:</strong> ${withdrawal.payment_method === 'bank' ? 'Bank Transfer' : 'USDT Crypto'}</p>
            <p><strong>Recipient:</strong> ${withdrawal.payment_method === 'bank' ? 
                `${withdrawal.account_details?.bank_name} - ${withdrawal.account_details?.account_number}` : 
                withdrawal.account_details?.crypto_address}</p>
        </div>
        <p class="form-help">This action cannot be undone. Ensure the funds have been sent to the recipient.</p>
    `;
    document.getElementById('modalTitle').textContent = 'Complete Withdrawal';
    document.getElementById('confirmAction').textContent = 'Mark as Completed';
    document.getElementById('confirmAction').onclick = async () => {
        try {
            const { error } = await supabase
                .from('withdrawal_request')
                .update({ status: 'completed', processed_at: new Date().toISOString() })
                .eq('id', withdrawalId);
            if (error) throw error;

            // Notify user
            await supabase.from('notification').insert({
                user_id: withdrawal.user_id,
                type: 'withdrawal_completed',
                message: `Your withdrawal of ${withdrawal.amount} $ has been processed and sent.`,
                read: false
            });

            alert('✅ Withdrawal marked as completed!');
            closeActionModal();
            await reloadAllData();
        } catch (error) {
            console.error("Error completing withdrawal:", error);
            alert("❌ Failed to complete withdrawal: " + (error.message || error));
        }
    };
    modal.style.display = 'block';
}

function showRejectModal(withdrawalId) {
    const withdrawal = allWithdrawals.find(w => w.id === withdrawalId);
    if (!withdrawal) {
        alert('Withdrawal not found.');
        return;
    }
    document.getElementById('rejectionReason').value = '';
    document.getElementById('confirmReject').dataset.withdrawalId = withdrawalId;
    document.getElementById('confirmReject').dataset.bulk = '';
    document.getElementById('rejectModal').style.display = 'block';
}

async function executeRejection() {
    const withdrawalId = document.getElementById('confirmReject').dataset.withdrawalId;
    const isBulk = document.getElementById('confirmReject').dataset.bulk === 'true';
    const reason = document.getElementById('rejectionReason').value.trim();
    if (!reason) {
        alert('Please provide a reason for rejection.');
        return;
    }

    const ids = isBulk ? Array.from(selectedWithdrawals) : [withdrawalId];

    try {
        for (const id of ids) {
            const withdrawal = allWithdrawals.find(w => w.id === id);
            if (!withdrawal) continue;

            // 1. Refund user's coin balance
            const { data: user, error: userError } = await supabase
                .from('users')
                .select('coin_balance')
                .eq('id', withdrawal.user_id)
                .single();
            if (userError) throw userError;

            const newBalance = parseFloat(user.coin_balance || 0) + parseFloat(withdrawal.total_deducted);
            const { error: balanceError } = await supabase
                .from('users')
                .update({ coin_balance: newBalance })
                .eq('id', withdrawal.user_id);
            if (balanceError) throw balanceError;

            // 2. Update withdrawal status
            const { error: updateError } = await supabase
                .from('withdrawal_request')
                .update({ status: 'rejected', admin_notes: reason })
                .eq('id', id);
            if (updateError) throw updateError;

            // 3. Record refund transaction
            await supabase.from('coin_transaction').insert({
                to_user_id: withdrawal.user_id,
                to_user_name: withdrawal.user?.full_name || withdrawal.user?.username || 'User',
                amount: withdrawal.total_deducted,
                type: 'refund',
                note: `Withdrawal request #${id.substring(0, 8)} rejected`,
                balance_after: newBalance
            });

            // 4. Notify user
            await supabase.from('notification').insert({
                user_id: withdrawal.user_id,
                type: 'withdrawal_rejected',
                message: `Your withdrawal request was rejected. Reason: ${reason}. Funds have been refunded.`,
                read: false
            });
        }

        alert(`✅ ${ids.length} withdrawal(s) rejected and coins refunded!`);
        closeRejectModal();
        selectedWithdrawals.clear();
        await reloadAllData();
    } catch (error) {
        console.error("Error rejecting withdrawal(s):", error);
        alert("❌ Failed to reject withdrawal: " + (error.message || error));
    }
}

function showBulkRejectModal() {
    if (selectedWithdrawals.size === 0) {
        alert('Please select at least one withdrawal to reject.');
        return;
    }
    document.getElementById('rejectionReason').value = '';
    document.getElementById('rejectModal').style.display = 'block';
    document.getElementById('confirmReject').dataset.bulk = 'true';
    document.getElementById('confirmReject').dataset.withdrawalId = '';
}

function viewWithdrawalDetails(withdrawalId) {
    const withdrawal = allWithdrawals.find(w => w.id === withdrawalId);
    if (!withdrawal) {
        alert('Withdrawal not found.');
        return;
    }
    const modal = document.getElementById('actionModal');
    const content = document.getElementById('modalContent');
    const userName = withdrawal.account_details?.account_name || withdrawal.user?.full_name || withdrawal.user?.username || 'Unknown';
    const timestamps = `
        <p><strong>Created:</strong> ${new Date(withdrawal.created_at).toLocaleString()}</p>
        ${withdrawal.processed_at ? `<p><strong>Processing Started:</strong> ${new Date(withdrawal.processed_at).toLocaleString()}</p>` : ''}
        ${withdrawal.completed_at ? `<p><strong>Completed:</strong> ${new Date(withdrawal.completed_at).toLocaleString()}</p>` : ''}
        ${withdrawal.cancelled_at ? `<p><strong>Cancelled:</strong> ${new Date(withdrawal.cancelled_at).toLocaleString()}</p>` : ''}
    `;
    content.innerHTML = `
        <h4>Withdrawal Details</h4>
        <div class="confirmation-details">
            <p><strong>ID:</strong> ${withdrawal.id}</p>
            <p><strong>User:</strong> ${userName}</p>
            <p><strong>Amount:</strong> ${withdrawal.amount} TN (${formatNGN(withdrawal.amount)})</p>
            <p><strong>Fee:</strong> ${withdrawal.fee} TN (${formatNGN(withdrawal.fee)})</p>
            <p><strong>Total Deducted:</strong> ${withdrawal.total_deducted} TN (${formatNGN(withdrawal.total_deducted)})</p>
            <p><strong>Method:</strong> ${withdrawal.payment_method === 'bank' ? 'Bank Transfer' : 'USDT Crypto'}</p>
            <p><strong>Status:</strong> ${withdrawal.status}</p>
            ${withdrawal.admin_notes ? `<p><strong>Admin Notes:</strong> ${withdrawal.admin_notes}</p>` : ''}
        </div>
        <h4 style="margin-top: 1rem;">Timestamps</h4>
        ${timestamps}
    `;
    document.getElementById('modalTitle').textContent = 'Withdrawal Details';
    document.getElementById('confirmAction').style.display = 'none';
    document.getElementById('cancelAction').textContent = 'Close';
    modal.style.display = 'block';
}

function closeActionModal() {
    document.getElementById('actionModal').style.display = 'none';
    document.getElementById('confirmAction').style.display = 'block';
    document.getElementById('cancelAction').textContent = 'Cancel';
}

function closeRejectModal() {
    document.getElementById('rejectModal').style.display = 'none';
    document.getElementById('confirmReject').dataset.bulk = '';
}

async function reloadAllData() {
    await loadWithdrawals();
    selectedWithdrawals.clear();
    updateBulkActionsUI();
}

async function bulkAction(action) {
    if (selectedWithdrawals.size === 0) {
        alert('Please select at least one withdrawal.');
        return;
    }
    const withdrawalIds = Array.from(selectedWithdrawals);
    try {
        for (const id of withdrawalIds) {
            const { error } = await supabase
                .from('withdrawal_request')
                .update({
                    status: action === 'completed' ? 'completed' : 'processing',
                    processed_at: new Date().toISOString()
                })
                .eq('id', id);
            if (error) throw error;
        }
        alert(`✅ ${withdrawalIds.length} withdrawal(s) marked as ${action === 'completed' ? 'completed' : 'processing'}!`);
        selectedWithdrawals.clear();
        await reloadAllData();
    } catch (error) {
        console.error("Error in bulk action:", error);
        alert("❌ Failed to process bulk action: " + (error.message || error));
    }
}