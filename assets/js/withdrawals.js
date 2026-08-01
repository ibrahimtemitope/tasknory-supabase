// withdrawals.js — SUPABASE VERSION
// Import the global Supabase client + helpers
import { supabase, getCurrentUser } from './api.js';

let currentUser = null;
let selectedMethod = null;          // 'bank' only
let selectedPaymentMethod = null;   // full method object
let selectedCountry = null;         // only for bank methods

// ===================== COUNTRY DATA =====================
const COUNTRY_CHOICES = {
    'NG': 'Nigeria', 'US': 'United States', 'GB': 'United Kingdom', 'SEPA': 'SEPA (Eurozone)',
    'GH': 'Ghana', 'KE': 'Kenya', 'UG': 'Uganda', 'TZ': 'Tanzania', 'RW': 'Rwanda',
    'ZA': 'South Africa', 'EG': 'Egypt', 'ET': 'Ethiopia', 'CM': 'Cameroon',
    'CI': 'Ivory Coast', 'SN': 'Senegal', 'CF': 'Central African Republic', 'TD': 'Chad',
    'CG': 'Republic of Congo', 'GA': 'Gabon', 'GW': 'Guinea Bissau', 'MW': 'Malawi', 'ZM': 'Zambia'
};

const EXCHANGE_RATES = {
    'NGN': 1600, 'GHS': 12, 'KES': 130, 'UGX': 3700, 'TZS': 2500,
    'RWF': 1300, 'ZAR': 18, 'EGP': 30, 'XAF': 600, 'XOF': 600,
    'MWK': 1700, 'EUR': 0.92, 'GBP': 0.78, 'USD': 1
};

const COUNTRY_FEE_INFO = {
    'NG': { currency: 'NGN', type: 'tiered', tiers: [[5000, 10], [50000, 25], [Infinity, 50]] },
    'GH': { currency: 'GHS', type: 'flat', fee: 10 },
    'KE': { currency: 'KES', type: 'flat', fee: 100 },
    'UG': { currency: 'UGX', type: 'flat', fee: 5000 },
    'TZ': { currency: 'TZS', type: 'flat', fee: 3000 },
    'RW': { currency: 'RWF', type: 'flat', fee: 2000 },
    'ZA': { currency: 'ZAR', type: 'flat', fee: 10 },
    'EG': { currency: 'EGP', type: 'percentage', rate: 0.01, min: 20, max: 25 },
    'ET': { currency: 'USD', type: 'flat', fee: 4 },
    'CM': { currency: 'XAF', type: 'flat', fee: 1500 },
    'CI': { currency: 'XOF', type: 'tiered', tiers: [[50000000, 1500], [Infinity, 4000]] },
    'SN': { currency: 'XOF', type: 'flat', fee: 1500 },
    'CF': { currency: 'XAF', type: 'flat', fee: 1500 },
    'TD': { currency: 'XAF', type: 'flat', fee: 1500 },
    'CG': { currency: 'XAF', type: 'flat', fee: 1500 },
    'GA': { currency: 'XAF', type: 'flat', fee: 1500 },
    'GW': { currency: 'XOF', type: 'flat', fee: 0 },
    'MW': { currency: 'MWK', type: 'flat', fee: 2000 },
    'ZM': { currency: null, type: 'flat', fee: 0 },
    'US': { currency: 'USD', type: 'flat', fee: 40 },
    'GB': { currency: 'GBP', type: 'flat', fee: 35 },
    'SEPA': { currency: 'EUR', type: 'flat', fee: 35 }
};

// Hardcoded Nigerian banks (replaces Django /api/banks-ng/ endpoint)
const NIGERIAN_BANKS = [
    { code: '044', name: 'Access Bank' },
    { code: '023', name: 'Citibank Nigeria' },
    { code: '050', name: 'Ecobank Nigeria' },
    { code: '011', name: 'First Bank of Nigeria' },
    { code: '214', name: 'First City Monument Bank (FCMB)' },
    { code: '070', name: 'Fidelity Bank' },
    { code: '057', name: 'Zenith Bank' },
    { code: '058', name: 'Guaranty Trust Bank (GTBank)' },
    { code: '030', name: 'Heritage Bank' },
    { code: '301', name: 'Jaiz Bank' },
    { code: '082', name: 'Keystone Bank' },
    { code: '076', name: 'Polaris Bank' },
    { code: '101', name: 'Providus Bank' },
    { code: '039', name: 'Stanbic IBTC Bank' },
    { code: '232', name: 'Sterling Bank' },
    { code: '100', name: 'SunTrust Bank' },
    { code: '032', name: 'Union Bank' },
    { code: '033', name: 'United Bank for Africa (UBA)' },
    { code: '215', name: 'Unity Bank' },
    { code: '035', name: 'Wema Bank' }
];

// ===================== UTILITY FUNCTIONS =====================
function calculateTotalFee(amountUSD, country) {
    const platformFee = amountUSD * 0.10;               // 10% platform fee
    const info = COUNTRY_FEE_INFO[country];
    if (!info || !info.currency) return platformFee;    // no country fee

    const rate = EXCHANGE_RATES[info.currency] || 1;
    const amountLocal = amountUSD * rate;
    let countryFeeLocal = 0;

    if (info.type === 'flat') {
        countryFeeLocal = info.fee;
    } else if (info.type === 'percentage') {
        countryFeeLocal = amountLocal * info.rate;
        if (info.min) countryFeeLocal = Math.max(countryFeeLocal, info.min);
        if (info.max) countryFeeLocal = Math.min(countryFeeLocal, info.max);
    } else if (info.type === 'tiered') {
        for (let [threshold, fee] of info.tiers) {
            if (amountLocal <= threshold) {
                countryFeeLocal = fee;
                break;
            }
        }
    }

    const countryFeeUSD = countryFeeLocal / rate;
    return platformFee + countryFeeUSD;
}

// ===================== INITIALIZATION =====================
document.addEventListener("DOMContentLoaded", function() {
    initializeWithdrawals();
    setupEventListeners();
});

async function initializeWithdrawals() {
    try {
        currentUser = await getCurrentUser();
        if (!currentUser) {
            alert("You must be logged in to withdraw funds.");
            window.location.href = "login.html";
            return;
        }
        await loadUserBalance();
        await loadSavedPaymentMethods();
        await loadWithdrawalHistory();
    } catch (error) {
        console.error("Init error:", error);
        alert("You must be logged in to withdraw funds.");
        window.location.href = "login.html";
    }
}

function setupEventListeners() {
    document.getElementById('bankMethod').addEventListener('click', () => selectWithdrawalMethod('bank'));

    document.getElementById('addNewMethodBtn').addEventListener('click', showAddMethodForm);
    document.getElementById('cancelMethodBtn').addEventListener('click', cancelAddMethod);
    document.getElementById('paymentMethodForm').addEventListener('submit', savePaymentMethod);

    document.getElementById('withdrawalAmount').addEventListener('input', updateAmountPreview);
    document.getElementById('cancelWithdrawal').addEventListener('click', resetWithdrawalForm);
    document.getElementById('withdrawalRequestForm').addEventListener('submit', submitWithdrawalRequest);

    document.getElementById('closeConfirmModal').addEventListener('click', closeConfirmModal);
    document.getElementById('cancelConfirm').addEventListener('click', closeConfirmModal);

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
        sidebar.addEventListener("click", (e) => e.stopPropagation());
        document.querySelectorAll('.nav-link').forEach(link => {
            link.addEventListener('click', () => {
                sidebar.classList.remove("mobile-open");
                mobileMenuBtn.classList.remove("active");
            });
        });
    }
}

// ===================== USER BALANCE =====================
async function loadUserBalance() {
    document.getElementById("availableBalance").textContent = `${currentUser.coin_balance || 0} $`;
}

// ===================== PAYMENT METHODS =====================
async function loadSavedPaymentMethods() {
    try {
        const { data: methods, error } = await supabase
            .from('withdrawal_method')
            .select('*')
            .eq('user_id', currentUser.id)
            .order('created_at', { ascending: false });
        if (error) throw error;

        const container = document.getElementById("savedMethodsList");

        if (!methods || methods.length === 0) {
            container.innerHTML = '<p class="no-methods">No saved payment methods. Please add one.</p>';
            return;
        }

        let html = '';
        methods.forEach(method => {
            const isSelected = selectedPaymentMethod?.id === method.id;
            let details = '';

            if (method.type === 'bank') {
                const bd = method.bank_details || {};
                if (method.country === 'NG') {
                    details = `${bd.bank_name || ''} - ${bd.account_number || ''}`;
                } else {
                    details = `${bd.bank_name || ''} ${bd.account_number || ''}`;
                }
            }

            html += `
                <div class="saved-method ${isSelected ? 'selected' : ''}" data-method-id="${method.id}">
                    <div>
                        <strong>${method.label}</strong>
                        <div class="method-details">${details}</div>
                        ${method.is_default ? '<span class="default-badge">Default</span>' : ''}
                    </div>
                    <div>
                        <button class="btn btn-sm btn-outline set-default-btn" data-method-id="${method.id}">
                            ${method.is_default ? '✓ Default' : 'Set Default'}
                        </button>
                    </div>
                </div>
            `;
        });

        container.innerHTML = html;

        container.querySelectorAll('.saved-method').forEach(methodEl => {
            methodEl.addEventListener('click', (e) => {
                if (!e.target.classList.contains('set-default-btn')) {
                    const methodObj = methods.find(m => m.id === methodEl.dataset.methodId);
                    selectPaymentMethod(methodObj);
                }
            });
        });

        container.querySelectorAll('.set-default-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                setDefaultPaymentMethod(btn.dataset.methodId);
            });
        });
    } catch (error) {
        console.error("Error loading payment methods:", error);
    }
}

function selectWithdrawalMethod(method) {
    selectedMethod = method;

    document.querySelectorAll('.method-card').forEach(card => card.classList.remove('selected'));
    document.getElementById(`${method}Method`).classList.add('selected');

    document.getElementById('savedMethodsSection').style.display = 'block';
    selectedPaymentMethod = null;
    selectedCountry = null;
    document.getElementById('withdrawalForm').style.display = 'none';
    document.getElementById('newMethodForm').style.display = 'none';

    loadSavedPaymentMethods();
}

function selectPaymentMethod(method) {
    selectedPaymentMethod = method;
    selectedCountry = method.type === 'bank' ? method.country : null;

    document.querySelectorAll('.saved-method').forEach(m => m.classList.remove('selected'));
    const el = document.querySelector(`[data-method-id="${method.id}"]`);
    if (el) el.classList.add('selected');

    document.getElementById('withdrawalForm').style.display = 'block';
    document.getElementById('newMethodForm').style.display = 'none';

    const amountInput = document.getElementById('withdrawalAmount');
    const amountHelp = document.getElementById('amountHelp');

    if (selectedMethod === 'bank') {
        amountInput.min = 10;
        amountInput.max = 2000;
        if (amountHelp) amountHelp.textContent = 'Enter amount between 10 - 2,000 $';
    }

    amountInput.value = '';
    updateAmountPreview();
}

async function setDefaultPaymentMethod(methodId) {
    try {
        // First, unset any existing default
        const { error: unsetError } = await supabase
            .from('withdrawal_method')
            .update({ is_default: false })
            .eq('user_id', currentUser.id)
            .eq('is_default', true);
        if (unsetError) throw unsetError;

        // Then set the new default
        const { error: setError } = await supabase
            .from('withdrawal_method')
            .update({ is_default: true })
            .eq('id', methodId)
            .eq('user_id', currentUser.id);
        if (setError) throw setError;

        await loadSavedPaymentMethods();
    } catch (error) {
        console.error('Error setting default method:', error);
        alert('❌ Failed to set default payment method.');
    }
}

// ===================== ADD NEW METHOD =====================
function showAddMethodForm() {
    document.getElementById('newMethodForm').style.display = 'block';
    document.getElementById('savedMethodsSection').style.display = 'none';
    document.getElementById('paymentMethodForm').reset();
    document.getElementById('bankFields').innerHTML = '';

    let countryHtml = `
        <div class="form-group">
            <label for="bankCountry">Select Country</label>
            <select id="bankCountry" class="form-input" required>
                <option value="">-- Choose --</option>
                ${Object.entries(COUNTRY_CHOICES).map(([code, name]) => `<option value="${code}">${name}</option>`).join('')}
            </select>
        </div>
    `;
    document.getElementById('bankFields').innerHTML = countryHtml;
    document.getElementById('bankFields').style.display = 'block';
    document.getElementById('bankCountry').addEventListener('change', onCountryChange);
    document.getElementById('methodFormTitle').textContent = 'Add Bank Account';
}

function cancelAddMethod() {
    document.getElementById('newMethodForm').style.display = 'none';
    document.getElementById('savedMethodsSection').style.display = 'block';
    if (selectedPaymentMethod) {
        document.getElementById('withdrawalForm').style.display = 'block';
    }
}

async function onCountryChange(e) {
    const country = e.target.value;
    const container = document.getElementById('bankFields');
    let html = `<input type="hidden" id="bankCountry" value="${country}">`;

    if (country === 'NG') {
        html += `
            <div class="form-group">
                <label for="bankSelect">Select Bank</label>
                <select id="bankSelect" class="form-input" required>
                    <option value="">-- Choose Bank --</option>
                    ${NIGERIAN_BANKS.map(b => `<option value="${b.code}" data-name="${b.name}">${b.name}</option>`).join('')}
                </select>
            </div>
            <div class="form-group">
                <label for="account_number">Account Number</label>
                <input type="text" id="account_number" class="form-input" required>
            </div>
            <div class="form-group">
                <label for="account_name">Account Name</label>
                <input type="text" id="account_name" class="form-input" required>
            </div>
        `;
    } else if (country === 'US') {
        html += `
            <div class="form-group">
                <label for="bank_name">Bank Name</label>
                <input type="text" id="bank_name" class="form-input" required>
            </div>
            <div class="form-group">
                <label for="account_number">Account Number</label>
                <input type="text" id="account_number" class="form-input" required>
            </div>
            <div class="form-group">
                <label for="account_name">Account Name</label>
                <input type="text" id="account_name" class="form-input" required>
            </div>
            <div class="form-group">
                <label for="routing_number">Routing Number</label>
                <input type="text" id="routing_number" class="form-input" required>
            </div>
            <div class="form-group">
                <label for="swift_code">SWIFT Code</label>
                <input type="text" id="swift_code" class="form-input" required>
            </div>
            <div class="form-group">
                <label for="account_type">Account Type</label>
                <select id="account_type" class="form-input" required>
                    <option value="checking">Checking</option>
                    <option value="savings">Savings</option>
                </select>
            </div>
            <div class="form-group">
                <label for="beneficiary_address">Beneficiary Address</label>
                <input type="text" id="beneficiary_address" class="form-input" required>
            </div>
            <div class="form-group">
                <label for="city">City</label>
                <input type="text" id="city" class="form-input" required>
            </div>
            <div class="form-group">
                <label for="state">State</label>
                <input type="text" id="state" class="form-input" required>
            </div>
            <div class="form-group">
                <label for="zip_code">ZIP Code</label>
                <input type="text" id="zip_code" class="form-input" required>
            </div>
        `;
    } else if (country === 'GB') {
        html += `
            <div class="form-group">
                <label for="bank_name">Bank Name</label>
                <input type="text" id="bank_name" class="form-input" required>
            </div>
            <div class="form-group">
                <label for="account_number">Account Number</label>
                <input type="text" id="account_number" class="form-input" required>
            </div>
            <div class="form-group">
                <label for="account_name">Account Name</label>
                <input type="text" id="account_name" class="form-input" required>
            </div>
            <div class="form-group">
                <label for="sort_code">Sort Code</label>
                <input type="text" id="sort_code" class="form-input" required>
            </div>
            <div class="form-group">
                <label for="swift_code">SWIFT Code</label>
                <input type="text" id="swift_code" class="form-input" required>
            </div>
            <div class="form-group">
                <label for="beneficiary_address">Beneficiary Address</label>
                <input type="text" id="beneficiary_address" class="form-input" required>
            </div>
            <div class="form-group">
                <label for="city">City</label>
                <input type="text" id="city" class="form-input" required>
            </div>
            <div class="form-group">
                <label for="postal_code">Postal Code</label>
                <input type="text" id="postal_code" class="form-input" required>
            </div>
        `;
    } else if (country === 'SEPA') {
        html += `
            <div class="form-group">
                <label for="bank_name">Bank Name</label>
                <input type="text" id="bank_name" class="form-input" required>
            </div>
            <div class="form-group">
                <label for="iban">IBAN</label>
                <input type="text" id="iban" class="form-input" required>
            </div>
            <div class="form-group">
                <label for="swift_code">SWIFT Code</label>
                <input type="text" id="swift_code" class="form-input" required>
            </div>
            <div class="form-group">
                <label for="beneficiary_address">Beneficiary Address</label>
                <input type="text" id="beneficiary_address" class="form-input" required>
            </div>
            <div class="form-group">
                <label for="city">City</label>
                <input type="text" id="city" class="form-input" required>
            </div>
            <div class="form-group">
                <label for="postal_code">Postal Code</label>
                <input type="text" id="postal_code" class="form-input" required>
            </div>
        `;
    } else if (country === 'ZA') {
        html += `
            <div class="form-group">
                <label for="bank_name">Bank Name</label>
                <input type="text" id="bank_name" class="form-input" required>
            </div>
            <div class="form-group">
                <label for="account_number">Account Number</label>
                <input type="text" id="account_number" class="form-input" required>
            </div>
            <div class="form-group">
                <label for="account_name">Account Name</label>
                <input type="text" id="account_name" class="form-input" required>
            </div>
            <div class="form-group">
                <label for="bank_code">Bank Code</label>
                <input type="text" id="bank_code" class="form-input" required>
            </div>
            <div class="form-group">
                <label for="branch_code">Branch Code</label>
                <input type="text" id="branch_code" class="form-input" required>
            </div>
        `;
    } else {
        html += `
            <div class="form-group">
                <label for="bank_name">Bank Name</label>
                <input type="text" id="bank_name" class="form-input" required>
            </div>
            <div class="form-group">
                <label for="account_number">Account Number</label>
                <input type="text" id="account_number" class="form-input" required>
            </div>
            <div class="form-group">
                <label for="account_name">Account Name</label>
                <input type="text" id="account_name" class="form-input" required>
            </div>
            <div class="form-group">
                <label for="bank_code">Bank Code</label>
                <input type="text" id="bank_code" class="form-input" required>
            </div>
        `;
    }

    container.innerHTML = html;
}

async function savePaymentMethod(e) {
    e.preventDefault();

    const label = document.getElementById('methodLabel').value.trim();
    if (!label) {
        alert('Please enter a label for this payment method.');
        return;
    }

    const country = document.getElementById('bankCountry')?.value;
    if (!country) {
        alert('Please select a country.');
        return;
    }

    const bankDetails = {};
    document.querySelectorAll('#bankFields input, #bankFields select').forEach(el => {
        if (el.id && el.value) {
            bankDetails[el.id] = el.value;
        }
    });
    bankDetails.country = country;

    if (country === 'NG') {
        const bankSelect = document.getElementById('bankSelect');
        if (bankSelect) {
            const selected = bankSelect.options[bankSelect.selectedIndex];
            bankDetails.bank_code = selected.value;
            bankDetails.bank_name = selected.dataset.name;
        }
    }

    const methodData = {
        user_id: currentUser.id,
        type: selectedMethod || 'bank',
        label: label,
        country: country,
        bank_details: bankDetails,
        is_default: false
    };

    try {
        const { data, error } = await supabase
            .from('withdrawal_method')
            .insert(methodData)
            .select()
            .single();
        if (error) throw error;

        alert('✅ Payment method saved successfully!');
        cancelAddMethod();
        await loadSavedPaymentMethods();
        selectPaymentMethod(data);

    } catch (error) {
        console.error('Error saving payment method:', error);
        alert('❌ Failed to save payment method: ' + (error.message || error));
    }
}

// ===================== WITHDRAWAL FORM =====================
function updateAmountPreview() {
    const amount = parseFloat(document.getElementById('withdrawalAmount').value) || 0;
    const previewAmount = document.getElementById('previewAmount');
    const previewFee = document.getElementById('previewFee');
    const previewTotal = document.getElementById('previewTotal');
    const previewReceive = document.getElementById('previewReceive');

    let fee = 0;
    if (selectedPaymentMethod?.country) {
        fee = calculateTotalFee(amount, selectedPaymentMethod.country);
    }
    fee = Math.round(fee * 100) / 100;

    const total = amount + fee;
    const receive = amount;

    if (previewAmount) previewAmount.textContent = `${amount} $`;
    if (previewFee) previewFee.textContent = `${fee} $`;
    if (previewTotal) previewTotal.textContent = `${total} $`;
    if (previewReceive) previewReceive.textContent = `${receive} $`;
}

function resetWithdrawalForm() {
    document.getElementById('withdrawalForm').style.display = 'none';
    selectedPaymentMethod = null;
    selectedCountry = null;
    document.querySelectorAll('.saved-method').forEach(m => m.classList.remove('selected'));
    document.getElementById('savedMethodsSection').style.display = 'block';
}

function submitWithdrawalRequest(e) {
    e.preventDefault();

    const amount = parseFloat(document.getElementById('withdrawalAmount').value);
    if (!amount || amount <= 0) {
        alert('Please enter a valid amount.');
        return;
    }

    if (!selectedPaymentMethod) {
        alert('Please select a payment method.');
        return;
    }

    if (amount < 10 || amount > 2000) {
        alert('Bank withdrawal amount must be between 10 $ and 2,000 $.');
        return;
    }

    const fee = selectedPaymentMethod.country
        ? calculateTotalFee(amount, selectedPaymentMethod.country)
        : 0;
    const total = amount + fee;

    showWithdrawalConfirmation({
        amount,
        fee,
        total,
        method: selectedMethod,
        paymentMethod: selectedPaymentMethod,
        country: selectedPaymentMethod.country
    });
}

function showWithdrawalConfirmation(details) {
    const modal = document.getElementById('confirmModal');
    const content = document.getElementById('confirmContent');

    let methodDetails = '';
    const bd = details.paymentMethod.bank_details || {};
    if (details.paymentMethod.country === 'NG') {
        methodDetails = `${bd.bank_name || ''} - ${bd.account_number || ''}`;
    } else {
        methodDetails = `${bd.bank_name || ''} ${bd.account_number || ''}`;
    }

    content.innerHTML = `
        <p>Please confirm your withdrawal request:</p>
        <div class="confirmation-details">
            <p><strong>Method:</strong> Bank Transfer</p>
            <p><strong>Recipient:</strong> ${details.paymentMethod.label}</p>
            <p><strong>Details:</strong> ${methodDetails}</p>
            <p><strong>Amount to Receive:</strong> ${details.amount} $</p>
            <p><strong>Processing Fee:</strong> ${details.fee.toFixed(2)} $</p>
            <p><strong>Total Deducted:</strong> ${details.total.toFixed(2)} $</p>
        </div>
        <p class="form-help">You can cancel this withdrawal while it's pending admin approval.</p>
    `;

    const confirmBtn = document.getElementById('confirmWithdrawal');
    confirmBtn.onclick = () => executeWithdrawal(details);

    modal.style.display = 'block';
}

function closeConfirmModal() {
    document.getElementById('confirmModal').style.display = 'none';
}

async function executeWithdrawal(details) {
    const confirmBtn = document.getElementById('confirmWithdrawal');
    confirmBtn.disabled = true;
    confirmBtn.innerHTML = '🔄 Processing...';

    try {
        // 1. Check balance
        const { data: user, error: userError } = await supabase
            .from('users')
            .select('coin_balance')
            .eq('id', currentUser.id)
            .single();
        if (userError) throw userError;

        const balance = parseFloat(user.coin_balance || 0);
        if (balance < details.total) {
            throw new Error('Insufficient balance');
        }

        // 2. Deduct balance
        const newBalance = balance - details.total;
        const { error: balanceError } = await supabase
            .from('users')
            .update({ coin_balance: newBalance })
            .eq('id', currentUser.id);
        if (balanceError) throw balanceError;

        // 3. Create withdrawal request
        const { data: withdrawal, error: wdError } = await supabase
            .from('withdrawal_request')
            .insert({
                user_id: currentUser.id,
                withdrawal_method_id: details.paymentMethod.id,
                amount: details.amount,
                fee: details.fee,
                total_deducted: details.total,
                payment_method: details.method || 'bank',
                account_details: details.paymentMethod.bank_details || {},
                status: 'pending'
            })
            .select()
            .single();
        if (wdError) throw wdError;

        // 4. Record transaction
        const { error: txError } = await supabase
            .from('coin_transaction')
            .insert({
                from_user_id: currentUser.id,
                from_user_name: currentUser.full_name || currentUser.username,
                to_user_id: currentUser.id,
                to_user_name: currentUser.full_name || currentUser.username,
                amount: details.total,
                type: 'withdrawal',
                note: `Withdrawal request #${withdrawal.id}`,
                balance_after: newBalance
            });
        if (txError) console.warn('Transaction log error:', txError);

        // 5. Update local user
        currentUser.coin_balance = newBalance;

        alert("✅ Withdrawal request submitted successfully! It's now pending admin approval.");
        closeConfirmModal();
        resetWithdrawalForm();
        await loadUserBalance();
        await loadWithdrawalHistory();

    } catch (error) {
        console.error("Withdrawal error:", error);
        alert("❌ Withdrawal failed: " + (error.message || error));
    } finally {
        confirmBtn.disabled = false;
        confirmBtn.innerHTML = 'Confirm Withdrawal';
    }
}

// ===================== WITHDRAWAL HISTORY =====================
async function loadWithdrawalHistory() {
    const container = document.getElementById("withdrawalHistory");
    if (!container) return;
    container.innerHTML = "<div class='loading'>Loading withdrawal history...</div>";

    try {
        const { data: withdrawals, error } = await supabase
            .from('withdrawal_request')
            .select(`
                *,
                withdrawal_method:withdrawal_method_id(*)
            `)
            .eq('user_id', currentUser.id)
            .order('created_at', { ascending: false });
        if (error) throw error;

        if (!withdrawals || withdrawals.length === 0) {
            container.innerHTML = "<p>No withdrawal history yet.</p>";
            return;
        }

        let html = `
            <table class="transactions-table">
                <thead>
                    <tr>
                        <th>Date</th>
                        <th>Method</th>
                        <th>Amount</th>
                        <th>Fee</th>
                        <th>Status</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
        `;

        const statusColors = {
            'pending': '#f59e0b',
            'processing': '#3b82f6',
            'completed': '#10b981',
            'rejected': '#ef4444',
            'cancelled': '#6b7280'
        };

        withdrawals.forEach(withdrawal => {
            html += `
                <tr>
                    <td>${new Date(withdrawal.created_at).toLocaleDateString()}</td>
                    <td>🏦 Bank</td>
                    <td>${withdrawal.amount} $</td>
                    <td>${withdrawal.fee} $</td>
                    <td>
                        <span style="color: ${statusColors[withdrawal.status]}; font-weight: bold;">
                            ${withdrawal.status.charAt(0).toUpperCase() + withdrawal.status.slice(1)}
                        </span>
                    </td>
                    <td>
                        ${withdrawal.status === 'pending' ?
                            `<button class="btn btn-sm btn-outline cancel-withdrawal" data-withdrawal-id="${withdrawal.id}">Cancel</button>` :
                            '-'
                        }
                    </td>
                </tr>
            `;
        });

        html += `</tbody></table>`;
        container.innerHTML = html;

        container.querySelectorAll('.cancel-withdrawal').forEach(btn => {
            btn.addEventListener('click', (e) => {
                cancelWithdrawalRequest(e.target.dataset.withdrawalId);
            });
        });
    } catch (error) {
        console.error("Error loading withdrawal history:", error);
        container.innerHTML = "<p class='error'>Error loading history.</p>";
    }
}

async function cancelWithdrawalRequest(withdrawalId) {
    if (!confirm('Are you sure you want to cancel this withdrawal request? Your coins will be refunded immediately.')) {
        return;
    }

    try {
        // 1. Get the withdrawal to know the total_deducted
        const { data: withdrawal, error: fetchError } = await supabase
            .from('withdrawal_request')
            .select('total_deducted, status')
            .eq('id', withdrawalId)
            .eq('user_id', currentUser.id)
            .single();
        if (fetchError) throw fetchError;
        if (withdrawal.status !== 'pending') {
            alert('This withdrawal can no longer be cancelled.');
            return;
        }

        // 2. Refund balance
        const newBalance = parseFloat(currentUser.coin_balance || 0) + parseFloat(withdrawal.total_deducted);
        const { error: balanceError } = await supabase
            .from('users')
            .update({ coin_balance: newBalance })
            .eq('id', currentUser.id);
        if (balanceError) throw balanceError;

        // 3. Update withdrawal status
        const { error: updateError } = await supabase
            .from('withdrawal_request')
            .update({
                status: 'cancelled',
                cancelled_at: new Date().toISOString()
            })
            .eq('id', withdrawalId)
            .eq('user_id', currentUser.id);
        if (updateError) throw updateError;

        // 4. Record refund transaction
        const { error: txError } = await supabase
            .from('coin_transaction')
            .insert({
                to_user_id: currentUser.id,
                to_user_name: currentUser.full_name || currentUser.username,
                amount: withdrawal.total_deducted,
                type: 'refund',
                note: `Cancelled withdrawal #${withdrawalId}`,
                balance_after: newBalance
            });
        if (txError) console.warn('Refund transaction log error:', txError);

        // 5. Update local
        currentUser.coin_balance = newBalance;

        alert('✅ Withdrawal cancelled successfully! Coins have been refunded.');
        await loadUserBalance();
        await loadWithdrawalHistory();

    } catch (error) {
        console.error("Cancellation error:", error);
        alert("❌ Failed to cancel withdrawal: " + (error.message || error));
    }
}