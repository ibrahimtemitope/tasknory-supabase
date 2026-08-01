// wallet.js — SUPABASE VERSION
// Import the global Supabase client + helpers
import { supabase, getCurrentUser, STORAGE_BASE } from './api.js';

document.addEventListener("DOMContentLoaded", loadWalletData);

// Payment configuration storage
let paymentConfig = null;
let selectedCurrency = null;
let currentExchangeRate = null;

async function loadWalletData() {
    try {
        const user = await getCurrentUser();
        if (!user) return;
        await loadUserInfo(user);
        await loadWalletBalance(user);
        await loadTransactionHistory(user.id);
        await handlePaymentCallback();
        setupBuyCoinsFunctionality();
    } catch (error) {
        console.error("Error loading wallet data:", error);
        alert("Error loading wallet data. Please try again.");
    }
}

async function loadUserInfo(user) {
    const fullNameEl = document.getElementById("fullName");
    const accountTypeEl = document.getElementById("accountType");
    const displayAccountNumberEl = document.getElementById("displayAccountNumber");
    const accountNumberEl = document.getElementById("accountNumber");

    if (fullNameEl) fullNameEl.textContent = user.full_name;
    if (accountTypeEl) accountTypeEl.textContent = user.role === 'freelancer' ? 'Freelancer' : 'Client';
    if (displayAccountNumberEl) displayAccountNumberEl.textContent = user.account_number;
    if (accountNumberEl) accountNumberEl.textContent = user.account_number;
}

async function loadWalletBalance(user) {
    const availableBalanceEl = document.getElementById("availableBalance");
    if (availableBalanceEl) {
        availableBalanceEl.textContent = `${user.coin_balance || 0} $`;
    }
}

async function loadTransactionHistory(userId) {
    const container = document.getElementById("transactionsList");
    if (!container) return;

    container.innerHTML = "<div class='loading'>Loading transactions...</div>";

    try {
        const { data: transactions, error } = await supabase
            .from('coin_transaction')
            .select('*')
            .or(`from_user_id.eq.${userId},to_user_id.eq.${userId}`)
            .order('created_at', { ascending: false });
        if (error) throw error;

        if (!transactions || transactions.length === 0) {
            container.innerHTML = "<p>No transactions yet.</p>";
            return;
        }

        let tableHTML = `
            <table class="transactions-table">
                <thead>
                    <tr>
                        <th>Date</th>
                        <th>Description</th>
                        <th>Amount</th>
                        <th>Balance After</th>
                    </tr>
                </thead>
                <tbody>
        `;

        transactions.forEach(tx => {
            const isOutgoing = tx.from_user_id === userId;
            const isIncoming = tx.to_user_id === userId;

            let amountDisplay = '';
            let amountClass = '';
            let description = '';

            if (isOutgoing && isIncoming) {
                amountDisplay = `0 $`;
                description = tx.note || 'Transaction';
            } else if (isOutgoing) {
                amountDisplay = `-${tx.amount} $`;
                amountClass = 'amount-negative';
                description = `Sent to ${tx.to_user_name || 'user'}`;
            } else if (isIncoming) {
                amountDisplay = `+${tx.amount} $`;
                amountClass = 'amount-positive';
                description = `Received from ${tx.from_user_name || 'user'}`;
            } else {
                amountDisplay = `${tx.amount} $`;
                description = tx.note || 'Transaction';
            }

            let balanceAfter = tx.balance_after ? `${tx.balance_after} $` : 'N/A';

            tableHTML += `
                <tr>
                    <td>${new Date(tx.created_at).toLocaleDateString()}</td>
                    <td>${description}</td>
                    <td class="${amountClass}">${amountDisplay}</td>
                    <td>${balanceAfter}</td>
                </tr>
            `;
        });

        tableHTML += `
                </tbody>
            </table>
        `;

        container.innerHTML = tableHTML;
    } catch (error) {
        console.error("Error loading transactions:", error);
        container.innerHTML = "<p class='error'>Error loading transactions.</p>";
    }
}

// Currency flag emojis
const COUNTRY_FLAGS = {
    'NG': '🇳🇬', 'GH': '🇬🇭', 'KE': '🇰🇪', 'ZA': '🇿🇦', 'UG': '🇺🇬',
    'TZ': '🇹🇿', 'RW': '🇷🇼', 'ZM': '🇿🇲', 'CM': '🇨🇲', 'CI': '🇨🇮',
    'SN': '🇸🇳', 'ET': '🇪🇹', 'MW': '🇲🇼', 'US': '🇺🇸', 'GB': '🇬🇧',
    'CA': '🇨🇦', 'AU': '🇦🇺', 'DE': '🇩🇪', 'FR': '🇫🇷', 'IT': '🇮🇹',
    'ES': '🇪🇸', 'NL': '🇳🇱', 'BE': '🇧🇪', 'AT': '🇦🇹', 'PT': '🇵🇹',
    'IE': '🇮🇪', 'FI': '🇫🇮', 'SE': '🇸🇪', 'NO': '🇳🇴', 'DK': '🇩🇰',
    'CH': '🇨🇭', 'JP': '🇯🇵', 'AE': '🇦🇪', 'SA': '🇸🇦'
};

// Supported countries config (replaces Django REST endpoint)
const RESTRICTED_COUNTRIES = {
    'NG': { currency: 'NGN', name: 'Nigeria' },
    'GH': { currency: 'GHS', name: 'Ghana' },
    'KE': { currency: 'KES', name: 'Kenya' },
    'ZA': { currency: 'ZAR', name: 'South Africa' },
    'UG': { currency: 'UGX', name: 'Uganda' },
    'TZ': { currency: 'TZS', name: 'Tanzania' },
    'RW': { currency: 'RWF', name: 'Rwanda' },
    'ZM': { currency: 'ZMW', name: 'Zambia' },
    'CM': { currency: 'XAF', name: 'Cameroon' },
    'CI': { currency: 'XOF', name: 'Ivory Coast' },
    'SN': { currency: 'XOF', name: 'Senegal' },
    'ET': { currency: 'ETB', name: 'Ethiopia' },
    'MW': { currency: 'MWK', name: 'Malawi' }
};

const USD_COMPATIBLE_COUNTRIES = {
    'US': { currency: 'USD', name: 'United States' },
    'GB': { currency: 'GBP', name: 'United Kingdom' },
    'CA': { currency: 'CAD', name: 'Canada' },
    'AU': { currency: 'AUD', name: 'Australia' },
    'DE': { currency: 'EUR', name: 'Germany' },
    'FR': { currency: 'EUR', name: 'France' },
    'IT': { currency: 'EUR', name: 'Italy' },
    'ES': { currency: 'EUR', name: 'Spain' },
    'NL': { currency: 'EUR', name: 'Netherlands' },
    'BE': { currency: 'EUR', name: 'Belgium' },
    'AT': { currency: 'EUR', name: 'Austria' },
    'PT': { currency: 'EUR', name: 'Portugal' },
    'IE': { currency: 'EUR', name: 'Ireland' },
    'FI': { currency: 'EUR', name: 'Finland' },
    'SE': { currency: 'SEK', name: 'Sweden' },
    'NO': { currency: 'NOK', name: 'Norway' },
    'DK': { currency: 'DKK', name: 'Denmark' },
    'CH': { currency: 'CHF', name: 'Switzerland' },
    'JP': { currency: 'JPY', name: 'Japan' },
    'AE': { currency: 'AED', name: 'United Arab Emirates' },
    'SA': { currency: 'SAR', name: 'Saudi Arabia' }
};

const SUPPORTED_COUNTRIES = { ...RESTRICTED_COUNTRIES, ...USD_COMPATIBLE_COUNTRIES };

function getCurrencyName(currencyCode) {
    const names = {
        'NGN': 'Nigerian Naira', 'GHS': 'Ghanaian Cedi', 'KES': 'Kenyan Shilling',
        'ZAR': 'South African Rand', 'UGX': 'Ugandan Shilling', 'TZS': 'Tanzanian Shilling',
        'RWF': 'Rwandan Franc', 'ZMW': 'Zambian Kwacha', 'XAF': 'CFA Franc BEAC',
        'XOF': 'CFA Franc BCEAO', 'ETB': 'Ethiopian Birr', 'MWK': 'Malawian Kwacha',
        'USD': 'US Dollar', 'GBP': 'British Pound', 'EUR': 'Euro',
        'CAD': 'Canadian Dollar', 'AUD': 'Australian Dollar', 'AED': 'UAE Dirham',
        'SAR': 'Saudi Riyal', 'SEK': 'Swedish Krona', 'NOK': 'Norwegian Krone',
        'DKK': 'Danish Krone', 'CHF': 'Swiss Franc', 'JPY': 'Japanese Yen'
    };
    return names[currencyCode] || currencyCode;
}

async function fetchPaymentConfig() {
    console.log('Fetching payment config...');
    try {
        const user = await getCurrentUser();
        if (!user) throw new Error('Not authenticated');

        const userCountry = user.country || 'US';
        let config;

        if (userCountry in RESTRICTED_COUNTRIES) {
            const countryInfo = RESTRICTED_COUNTRIES[userCountry];
            const localCurrency = countryInfo.currency;
            config = {
                detected_country: {
                    code: userCountry,
                    name: countryInfo.name,
                    currency: localCurrency
                },
                available_currencies: [
                    { code: localCurrency, name: getCurrencyName(localCurrency), recommended: true },
                    { code: 'USD', name: 'US Dollar', recommended: false, warning: 'Your card may be declined for USD transactions. Local currency recommended.' }
                ],
                default_currency: localCurrency,
                warning: `Based on your profile country (${countryInfo.name}), we recommend paying in ${localCurrency} to avoid card restrictions.`,
                requires_local_currency: true
            };
        } else if (userCountry in USD_COMPATIBLE_COUNTRIES) {
            const countryInfo = USD_COMPATIBLE_COUNTRIES[userCountry];
            const localCurrency = countryInfo.currency;
            const currencies = [{ code: 'USD', name: 'US Dollar', recommended: true }];
            if (localCurrency !== 'USD') {
                currencies.push({ code: localCurrency, name: getCurrencyName(localCurrency), recommended: false });
            }
            config = {
                detected_country: {
                    code: userCountry,
                    name: countryInfo.name,
                    currency: localCurrency
                },
                available_currencies: currencies,
                default_currency: 'USD',
                warning: null,
                requires_local_currency: false
            };
        } else {
            config = {
                detected_country: {
                    code: userCountry,
                    name: 'Unknown',
                    currency: 'USD'
                },
                available_currencies: [
                    { code: 'USD', name: 'US Dollar', recommended: true }
                ],
                default_currency: 'USD',
                warning: 'Country not recognized. Defaulting to USD.',
                requires_local_currency: false
            };
        }

        config.supported_countries = Object.entries(SUPPORTED_COUNTRIES).map(([code, info]) => ({
            code, name: info.name, currency: info.currency
        }));

        paymentConfig = config;
        return config;
    } catch (error) {
        console.error('Error fetching payment config:', error);
        const container = document.getElementById('currencySelectorContainer');
        if (container) {
            container.innerHTML = `
                <div class="error-box" style="background: #fee2e2; border: 1px solid #ef4444; color: #991b1b; padding: 1rem; border-radius: 6px; margin-bottom: 1rem;">
                    <strong>⚠️ Error loading payment options</strong><br>
                    ${error.message || 'Failed to load configuration. Please try again or contact support.'}
                    <button onclick="location.reload()" style="margin-top: 0.5rem; padding: 0.5rem 1rem; background: #ef4444; color: white; border: none; border-radius: 4px; cursor: pointer;">Retry</button>
                </div>
            `;
        }
        return {
            detected_country: { code: 'US', name: 'United States', currency: 'USD' },
            available_currencies: [{ code: 'USD', name: 'US Dollar', recommended: true }],
            default_currency: 'USD',
            warning: null,
            requires_local_currency: false,
            supported_countries: []
        };
    }
}

function renderCurrencySelector(config) {
    console.log('Rendering currency selector with config:', config);
    const container = document.getElementById('currencySelectorContainer');
    if (!container) {
        console.error('ERROR: currencySelectorContainer not found in DOM!');
        return;
    }

    if (!config || !config.detected_country) {
        console.error('ERROR: Invalid config received:', config);
        container.innerHTML = '<p class="error">Error: Invalid configuration received</p>';
        return;
    }

    const flag = COUNTRY_FLAGS[config.detected_country.code] || '🌍';
    const countryName = config.detected_country.name || 'Unknown';

    let html = `
        <div class="country-detection">
            <div class="detected-country">
                <span class="flag">${flag}</span>
                <span class="country-name">${countryName}</span>
                <span class="badge">Detected</span>
            </div>
    `;

    if (config.warning) {
        html += `
            <div class="warning-box">
                <span class="warning-icon">⚠️</span>
                <span class="warning-text">${config.warning}</span>
            </div>
        `;
    }

    if (config.available_currencies && config.available_currencies.length > 1) {
        html += `<div class="currency-options">`;
        config.available_currencies.forEach((curr) => {
            const recommended = curr.recommended ? '<span class="recommended-badge">Recommended</span>' : '';
            const warning = curr.warning ? `<span class="currency-warning">${curr.warning}</span>` : '';
            const checked = curr.recommended ? 'checked' : '';

            html += `
                <label class="currency-option ${curr.recommended ? 'recommended' : ''}">
                    <input type="radio" name="currency" value="${curr.code}" ${checked} onchange="window.handleCurrencyChange('${curr.code}')">
                    <div class="currency-info">
                        <span class="currency-code">${curr.code}</span>
                        <span class="currency-name">${curr.name}</span>
                        ${recommended}
                        ${warning}
                    </div>
                </label>
            `;
        });
        html += `</div>`;
    } else if (config.available_currencies && config.available_currencies.length === 1) {
        const curr = config.available_currencies[0];
        html += `
            <div class="currency-options">
                <label class="currency-option recommended">
                    <input type="radio" name="currency" value="${curr.code}" checked onchange="window.handleCurrencyChange('${curr.code}')">
                    <div class="currency-info">
                        <span class="currency-code">${curr.code}</span>
                        <span class="currency-name">${curr.name}</span>
                        <span class="recommended-badge">Default</span>
                    </div>
                </label>
            </div>
        `;
    }

    if (config.supported_countries && config.supported_countries.length > 0) {
        html += `
            <div class="country-override">
                <button type="button" class="toggle-override" onclick="window.toggleCountryOverride()">
                    Not in ${countryName}? Click to change country
                </button>
                <div class="country-select-container" id="countryOverrideContainer" style="display: none;">
                    <select id="manualCountrySelect" class="form-select" onchange="window.handleCountryChange(this.value)">
                        <option value="">Select your country...</option>
        `;

        config.supported_countries.forEach(country => {
            const countryFlag = COUNTRY_FLAGS[country.code] || '🌍';
            html += `<option value="${country.code}">${countryFlag} ${country.name} (${country.currency})</option>`;
        });

        html += `
                    </select>
                </div>
            </div>
        `;
    }

    html += `</div>`;

    container.innerHTML = html;
    console.log('Currency selector rendered successfully');

    if (config.available_currencies && config.available_currencies.length > 0) {
        const defaultCurr = config.available_currencies.find(c => c.recommended) || config.available_currencies[0];
        if (defaultCurr) {
            selectedCurrency = defaultCurr.code;
            console.log('Initial currency set to:', selectedCurrency);
        }
    }
    currentExchangeRate = null;
}

window.handleCurrencyChange = function(currencyCode) {
    console.log('Currency changed to:', currencyCode);
    selectedCurrency = currencyCode;
    updateTotalCost();

    if (paymentConfig && paymentConfig.requires_local_currency && currencyCode === 'USD') {
        showCurrencyWarning('USD transactions may be declined by your bank. Local currency is recommended for higher success rates.');
    } else {
        hideCurrencyWarning();
    }
};

window.toggleCountryOverride = function() {
    console.log('Toggling country override');
    const container = document.getElementById('countryOverrideContainer');
    if (container) {
        container.style.display = container.style.display === 'none' ? 'block' : 'none';
    }
};

window.handleCountryChange = async function(countryCode) {
    console.log('Country changed to:', countryCode);
    if (!countryCode) return;

    if (!paymentConfig || !paymentConfig.supported_countries) {
        console.error('Payment config not loaded');
        return;
    }

    const country = paymentConfig.supported_countries.find(c => c.code === countryCode);
    if (country) {
        const flag = COUNTRY_FLAGS[countryCode] || '🌍';
        const countryDisplay = document.querySelector('.detected-country');
        if (countryDisplay) {
            countryDisplay.innerHTML = `
                <span class="flag">${flag}</span>
                <span class="country-name">${country.name}</span>
                <span class="badge manual">Manual</span>
            `;
        }

        const restrictedCodes = Object.keys(RESTRICTED_COUNTRIES);
        const isRestricted = restrictedCodes.includes(countryCode);

        let newCurrencies;
        if (isRestricted) {
            newCurrencies = [
                { code: country.currency, name: getCurrencyName(country.currency), recommended: true },
                { code: 'USD', name: 'US Dollar', recommended: false, warning: 'Your card may be declined' }
            ];
        } else {
            newCurrencies = [{ code: 'USD', name: 'US Dollar', recommended: true }];
            if (country.currency !== 'USD') {
                newCurrencies.push({ 
                    code: country.currency, 
                    name: getCurrencyName(country.currency), 
                    recommended: false 
                });
            }
        }

        const optionsContainer = document.querySelector('.currency-options');
        if (optionsContainer) {
            let html = '';
            newCurrencies.forEach(curr => {
                const recommended = curr.recommended ? '<span class="recommended-badge">Recommended</span>' : '';
                const warning = curr.warning ? `<span class="currency-warning">${curr.warning}</span>` : '';
                const checked = curr.recommended ? 'checked' : '';

                html += `
                    <label class="currency-option ${curr.recommended ? 'recommended' : ''}">
                        <input type="radio" name="currency" value="${curr.code}" ${checked} onchange="window.handleCurrencyChange('${curr.code}')">
                        <div class="currency-info">
                            <span class="currency-code">${curr.code}</span>
                            <span class="currency-name">${curr.name}</span>
                            ${recommended}
                            ${warning}
                        </div>
                    </label>
                `;
            });
            optionsContainer.innerHTML = html;
        }

        paymentConfig.detected_country = { code: countryCode, name: country.name, currency: country.currency };
        paymentConfig.available_currencies = newCurrencies;
        paymentConfig.requires_local_currency = isRestricted;

        const defaultCurr = newCurrencies.find(c => c.recommended) || newCurrencies[0];
        if (defaultCurr) {
            window.handleCurrencyChange(defaultCurr.code);
        }
    }
};

function showCurrencyWarning(message) {
    let warningEl = document.getElementById('currencyWarning');
    if (!warningEl) {
        warningEl = document.createElement('div');
        warningEl.id = 'currencyWarning';
        warningEl.className = 'currency-warning-box';
        const container = document.getElementById('currencySelectorContainer');
        if (container) {
            const countryDetection = container.querySelector('.country-detection');
            if (countryDetection) {
                countryDetection.insertBefore(warningEl, countryDetection.children[1]);
            }
        }
    }
    warningEl.innerHTML = `<span class="warning-icon">⚠️</span> ${message}`;
    warningEl.style.display = 'flex';
}

function hideCurrencyWarning() {
    const warningEl = document.getElementById('currencyWarning');
    if (warningEl) warningEl.style.display = 'none';
}

function updateTotalCost() {
    const coinInput = document.getElementById('coinAmount');
    const totalCostDisplay = document.getElementById('totalCost');
    const currencyLabel = document.getElementById('currencyLabel');
    const conversionInfo = document.getElementById('conversionInfo');

    if (!coinInput || !totalCostDisplay) return;

    const usdAmount = parseFloat(coinInput.value) || 0;

    if (selectedCurrency && selectedCurrency !== 'USD') {
        totalCostDisplay.textContent = `${usdAmount} USD (~${selectedCurrency})`;
        if (currencyLabel) currencyLabel.textContent = 'USD';

        if (conversionInfo) {
            conversionInfo.innerHTML = `
                <small class="conversion-note">
                    You will be charged in <strong>${selectedCurrency}</strong>. 
                    The exact amount will be calculated using the current exchange rate at checkout.
                </small>
            `;
        }
    } else {
        totalCostDisplay.textContent = usdAmount;
        if (currencyLabel) currencyLabel.textContent = 'USD';
        if (conversionInfo) conversionInfo.innerHTML = '';
    }
}

function setupBuyCoinsFunctionality() {
    console.log('Setting up buy coins functionality...');
    const buyCoinsBtn = document.getElementById('buyCoinsBtn');
    const buyCoinsModal = document.getElementById('buyCoinsModal');
    const closeBuyCoinsModal = document.getElementById('closeBuyCoinsModal');
    const cancelBuyCoins = document.getElementById('cancelBuyCoins');
    const coinAmountInput = document.getElementById('coinAmount');
    const buyCoinsForm = document.getElementById('buyCoinsForm');

    if (!buyCoinsBtn) {
        console.error('ERROR: buyCoinsBtn not found!');
        return;
    }
    if (!buyCoinsModal) {
        console.error('ERROR: buyCoinsModal not found!');
        return;
    }

    buyCoinsBtn.addEventListener('click', async () => {
        console.log('Add Funds button clicked');
        buyCoinsModal.style.display = 'block';

        const container = document.getElementById('currencySelectorContainer');
        if (container) {
            container.innerHTML = '<div class="loading">Loading payment options...</div>';
        }

        try {
            const config = await fetchPaymentConfig();
            if (config) {
                renderCurrencySelector(config);
            }
        } catch (error) {
            console.error('Error in modal open:', error);
        }
    });

    const closeModal = () => {
        buyCoinsModal.style.display = 'none';
        hideCurrencyWarning();
    };

    if (closeBuyCoinsModal) closeBuyCoinsModal.addEventListener('click', closeModal);
    if (cancelBuyCoins) cancelBuyCoins.addEventListener('click', closeModal);

    if (coinAmountInput) {
        coinAmountInput.addEventListener('input', updateTotalCost);
    }

    if (buyCoinsForm) {
        buyCoinsForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const amount = parseInt(coinAmountInput.value);
            if (!amount || amount < 1) {
                alert('Please enter a valid amount of funds');
                return;
            }

            const submitBtn = buyCoinsForm.querySelector('button[type="submit"]');
            const originalText = submitBtn ? submitBtn.innerHTML : 'Continue to Payment';

            try {
                if (submitBtn) {
                    submitBtn.disabled = true;
                    submitBtn.innerHTML = '🔄 Processing...';
                }

                // Call Supabase Edge Function to initiate payment
                // The Edge Function handles: exchange rate lookup, CoinPurchase record creation,
                // Flutterwave API call, and returns the checkout URL.
                const { data: functionResult, error: functionError } = await supabase.functions.invoke('initiate-payment', {
                    body: {
                        amount: amount,
                        currency: selectedCurrency || 'USD'
                    }
                });

                if (functionError) throw functionError;
                if (!functionResult || !functionResult.authorization_url) {
                    throw new Error('No payment URL received from server');
                }

                console.log('Purchase initiated:', functionResult);

                closeModal();
                buyCoinsForm.reset();
                updateTotalCost();

                if (functionResult.exchange_rate && functionResult.currency !== 'USD') {
                    alert(`You will be charged ${functionResult.amount} ${functionResult.currency} (Rate: 1 USD = ${functionResult.exchange_rate} ${functionResult.currency})`);
                }

                window.location.href = functionResult.authorization_url;

            } catch (error) {
                console.error('Payment initialization error:', error);
                alert('❌ Payment failed: ' + (error.message || error));
            } finally {
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = originalText;
                }
            }
        });
    }

    window.addEventListener('click', (e) => {
        if (e.target === buyCoinsModal) {
            closeModal();
        }
    });
}

async function handlePaymentCallback() {
    const urlParams = new URLSearchParams(window.location.search);
    const paymentCallback = urlParams.get('payment_callback');
    if (paymentCallback) {
        const newUrl = window.location.pathname;
        window.history.replaceState({}, '', newUrl);
        alert('✅ Payment completed successfully! Your funds have been added to your wallet.');
        await loadWalletData();
    }
}

function initThemeToggle() {
    const themeToggle = document.getElementById('themeToggle');
    if (!themeToggle) return;
    const themeIcon = themeToggle.querySelector('.theme-icon');
    const themeLabel = themeToggle.querySelector('.theme-label');
    const savedTheme = localStorage.getItem('theme');
    const prefersLight = window.matchMedia('(prefers-color-scheme: light)').matches;

    if (savedTheme === 'light' || (!savedTheme && prefersLight)) {
        document.documentElement.setAttribute('data-theme', 'light');
        if (themeIcon) themeIcon.textContent = '🌙';
        if (themeLabel) themeLabel.textContent = 'Dark Mode';
    } else {
        document.documentElement.setAttribute('data-theme', 'dark');
        if (themeIcon) themeIcon.textContent = '☀️';
        if (themeLabel) themeLabel.textContent = 'Light Mode';
    }

    themeToggle.addEventListener('click', () => {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        if (currentTheme === 'light') {
            document.documentElement.setAttribute('data-theme', 'dark');
            if (themeIcon) themeIcon.textContent = '☀️';
            if (themeLabel) themeLabel.textContent = 'Light Mode';
            localStorage.setItem('theme', 'dark');
        } else {
            document.documentElement.setAttribute('data-theme', 'light');
            if (themeIcon) themeIcon.textContent = '🌙';
            if (themeLabel) themeLabel.textContent = 'Dark Mode';
            localStorage.setItem('theme', 'light');
        }
    });
}

document.addEventListener('DOMContentLoaded', () => {
    initThemeToggle();
});