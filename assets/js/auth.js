// auth.js — SUPABASE VERSION
// All authentication handled by Supabase Auth (free tier)
// Import the global Supabase client
import { supabase } from './api.js';

// Utility: get form data into an object
function formToObject(form) {
    const data = new FormData(form);
    return Object.fromEntries(data.entries());
}

// Load countries from API (unchanged – still external REST API)
async function loadCountries() {
    const isFreelancerPage = window.location.pathname.includes('/freelancer/');

    try {
        let response;
        if (isFreelancerPage) {
            // Freelancer signup: Africa only
            response = await fetch('https://restcountries.com/v3.1/region/africa?fields=name,cca2,idd');
        } else {
            // Client signup: Global
            response = await fetch('https://restcountries.com/v3.1/all?fields=name,cca2,idd');
        }

        const countries = await response.json();
        countries.sort((a, b) => a.name.common.localeCompare(b.name.common));
        return countries;
    } catch (error) {
        console.error('Error loading countries:', error);

        // Fallbacks based on page
        if (isFreelancerPage) {
            return [
                { name: { common: 'Algeria' }, cca2: 'DZ', idd: { root: '+213' } },
                { name: { common: 'Botswana' }, cca2: 'BW', idd: { root: '+267' } },
                { name: { common: 'Cameroon' }, cca2: 'CM', idd: { root: '+237' } },
                { name: { common: 'Egypt' }, cca2: 'EG', idd: { root: '+20' } },
                { name: { common: 'Ethiopia' }, cca2: 'ET', idd: { root: '+251' } },
                { name: { common: 'Ghana' }, cca2: 'GH', idd: { root: '+233' } },
                { name: { common: 'Ivory Coast' }, cca2: 'CI', idd: { root: '+225' } },
                { name: { common: 'Kenya' }, cca2: 'KE', idd: { root: '+254' } },
                { name: { common: 'Morocco' }, cca2: 'MA', idd: { root: '+212' } },
                { name: { common: 'Nigeria' }, cca2: 'NG', idd: { root: '+234' } },
                { name: { common: 'Rwanda' }, cca2: 'RW', idd: { root: '+250' } },
                { name: { common: 'Senegal' }, cca2: 'SN', idd: { root: '+221' } },
                { name: { common: 'South Africa' }, cca2: 'ZA', idd: { root: '+27' } },
                { name: { common: 'Tanzania' }, cca2: 'TZ', idd: { root: '+255' } },
                { name: { common: 'Tunisia' }, cca2: 'TN', idd: { root: '+216' } },
                { name: { common: 'Uganda' }, cca2: 'UG', idd: { root: '+256' } },
                { name: { common: 'Zambia' }, cca2: 'ZM', idd: { root: '+260' } },
                { name: { common: 'Zimbabwe' }, cca2: 'ZW', idd: { root: '+263' } }
            ];
        } else {
            return [
                { name: { common: 'United States' }, cca2: 'US', idd: { root: '+1' } },
                { name: { common: 'United Kingdom' }, cca2: 'GB', idd: { root: '+44' } },
                { name: { common: 'Canada' }, cca2: 'CA', idd: { root: '+1' } },
                { name: { common: 'Germany' }, cca2: 'DE', idd: { root: '+49' } },
                { name: { common: 'France' }, cca2: 'FR', idd: { root: '+33' } },
                { name: { common: 'United Arab Emirates' }, cca2: 'AE', idd: { root: '+971' } },
                { name: { common: 'Saudi Arabia' }, cca2: 'SA', idd: { root: '+966' } },
                { name: { common: 'Nigeria' }, cca2: 'NG', idd: { root: '+234' } },
                { name: { common: 'South Africa' }, cca2: 'ZA', idd: { root: '+27' } },
                { name: { common: 'Kenya' }, cca2: 'KE', idd: { root: '+254' } },
                { name: { common: 'Ghana' }, cca2: 'GH', idd: { root: '+233' } }
            ];
        }
    }
}

// Populate country dropdown
async function populateCountryDropdown(selectId) {
    const select = document.getElementById(selectId);
    const countries = await loadCountries();
    select.innerHTML = '<option value="">Select your country</option>';
    countries.forEach(country => {
        const option = document.createElement('option');
        option.value = country.cca2;
        option.textContent = `${country.name.common} (${country.idd.root}${country.idd.suffixes ? country.idd.suffixes[0] : ''})`;
        option.setAttribute('data-country-code', country.idd.root);
        select.appendChild(option);
    });
}

// Phone validation (unchanged)
function validatePhoneNumber(phone, countryCode) {
    const cleaned = phone.replace(/[^\d+]/g, '');
    const rules = {
        'US': { min: 10, max: 10, example: '(555) 123-4567' },
        'GB': { min: 10, max: 10, example: '020 1234 5678' },
        'CA': { min: 10, max: 10, example: '(555) 123-4567' },
        'AU': { min: 9, max: 9, example: '412 345 678' },
        'DE': { min: 10, max: 11, example: '0171 1234567' },
        'FR': { min: 9, max: 9, example: '06 12 34 56 78' },
        'AE': { min: 9, max: 9, example: '50 123 4567' },
        'SA': { min: 9, max: 9, example: '51 234 5678' }
    };
    const digitsOnly = cleaned.replace(/\D/g, '');
    let phoneDigits = digitsOnly;
    if (countryCode && cleaned.startsWith(countryCode.replace('+', ''))) {
        phoneDigits = digitsOnly.substring(countryCode.replace('+', '').length);
    }
    const rule = rules[countryCode];
    if (rule) {
        return {
            isValid: phoneDigits.length >= rule.min && phoneDigits.length <= rule.max,
            example: rule.example
        };
    }
    return {
        isValid: digitsOnly.length >= 8 && digitsOnly.length <= 15,
        example: 'Enter valid phone number'
    };
}

function setupPhoneValidation() {
    const countrySelect = document.getElementById('country');
    const phoneInput = document.getElementById('telephone');
    const formatHint = document.querySelector('.phone-format-hint');
    if (countrySelect && phoneInput) {
        countrySelect.addEventListener('change', function() {
            const selectedOption = this.options[this.selectedIndex];
            const countryCode = selectedOption.getAttribute('data-country-code');
            if (countryCode && formatHint) {
                const validation = validatePhoneNumber('', this.value);
                formatHint.textContent = `Format: ${validation.example}`;
                formatHint.style.display = 'block';
                phoneInput.placeholder = `e.g., ${validation.example}`;
            } else {
                formatHint.style.display = 'none';
            }
        });
        phoneInput.addEventListener('blur', function() {
            const countrySelect = document.getElementById('country');
            const selectedCountry = countrySelect.value;
            const countryOption = countrySelect.options[countrySelect.selectedIndex];
            const countryDialCode = countryOption.getAttribute('data-country-code');
            if (selectedCountry && this.value) {
                const validation = validatePhoneNumber(this.value, selectedCountry);
                if (!validation.isValid) {
                    this.style.borderColor = '#ff4444';
                    if (formatHint) {
                        formatHint.textContent = `Invalid format. Example: ${validation.example}`;
                        formatHint.style.color = '#ff4444';
                    }
                } else {
                    this.style.borderColor = '';
                    if (formatHint) {
                        formatHint.textContent = `Format: ${validation.example}`;
                        formatHint.style.color = '#666';
                    }
                }
            }
        });
    }
}

// Load skills into checkbox container from Supabase
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

// --- Supabase Authentication ---

async function handleFreelancerSignup(event) {
    event.preventDefault();
    const data = formToObject(event.target);

    // Collect selected skills
    const checkboxes = document.querySelectorAll('#skillsCheckboxContainer .skill-checkbox:checked');
    const selectedSkillIds = Array.from(checkboxes).map(cb => parseInt(cb.value));
    if (selectedSkillIds.length === 0) {
        alert("Please select at least one skill.");
        return;
    }

    try {
        // Step 1: Signup with Supabase Auth
        // Pass all profile fields in user_metadata so the trigger populates public.users
        const { data: authData, error: authError } = await supabase.auth.signUp({
            email: data.email,
            password: data.password,
            options: {
                data: {
                    username: data.email.split('@')[0],
                    full_name: data.full_name,
                    role: 'freelancer',
                    country: data.country,
                    telephone: data.telephone,
                    language: data.language || 'English',
                    tone: data.tone
                }
            }
        });
        if (authError) throw authError;

        const userId = authData.user.id;

        // Step 2: Add skills to freelancer_skill table
        // The trigger already created the public.users row; now we link skills
        const skillRows = selectedSkillIds.map(skillId => ({
            freelancer_id: userId,
            skill_id: skillId
        }));
        const { error: skillError } = await supabase
            .from('freelancer_skill')
            .insert(skillRows);
        if (skillError) {
            console.error('Skill insert error:', skillError);
            // Non-fatal: user can add skills later in settings
        }

        // Fetch the created profile to show account number
        const { data: profile, error: profileError } = await supabase
            .from('users')
            .select('account_number')
            .eq('id', userId)
            .single();
        if (profileError) console.error('Profile fetch error:', profileError);

        alert(`Welcome to Tasknory! Your account number is: ${profile?.account_number || 'N/A'}\nPlease complete ID verification in settings to start working.`);
        window.location.href = "../freelancer/dashboard.html";
    } catch (error) {
        console.error('Signup error:', error);
        alert("Signup failed: " + (error.message || error));
    }
}

async function handleClientSignup(event) {
    event.preventDefault();
    const data = formToObject(event.target);

    try {
        const { data: authData, error: authError } = await supabase.auth.signUp({
            email: data.email,
            password: data.password,
            options: {
                data: {
                    username: data.email.split('@')[0],
                    full_name: data.full_name,
                    role: 'client',
                    country: data.country,
                    telephone: data.telephone,
                    language: data.language || 'English',
                    tone: data.tone,
                    business_name: data.account_type === 'business' ? data.business_name : null
                }
            }
        });
        if (authError) throw authError;

        const userId = authData.user.id;

        // Fetch the created profile to show account number
        const { data: profile, error: profileError } = await supabase
            .from('users')
            .select('account_number')
            .eq('id', userId)
            .single();
        if (profileError) console.error('Profile fetch error:', profileError);

        alert(`Welcome to Tasknory! Your account number is: ${profile?.account_number || 'N/A'}\nPlease complete ID verification in settings to post jobs.`);
        window.location.href = "../client/dashboard.html";
    } catch (error) {
        console.error('Signup error:', error);
        alert("Signup failed: " + (error.message || error));
    }
}

async function handleFreelancerLogin(event) {
    event.preventDefault();
    const data = formToObject(event.target);
    try {
        const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
            email: data.email,
            password: data.password
        });
        if (authError) throw authError;

        // Check role from user metadata
        const role = authData.user.user_metadata?.role;
        if (role !== 'freelancer') {
            alert("This is not a freelancer account.");
            await supabase.auth.signOut();
            return;
        }
        window.location.href = "../freelancer/dashboard.html";
    } catch (error) {
        console.error('Login error:', error);
        alert("Login failed: " + (error.message || error));
    }
}

async function handleClientLogin(event) {
    event.preventDefault();
    const data = formToObject(event.target);
    try {
        const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
            email: data.email,
            password: data.password
        });
        if (authError) throw authError;

        const role = authData.user.user_metadata?.role;
        if (role !== 'client') {
            alert("This is not a client account.");
            await supabase.auth.signOut();
            return;
        }
        window.location.href = "../client/dashboard.html";
    } catch (error) {
        console.error('Login error:', error);
        alert("Login failed: " + (error.message || error));
    }
}

async function handleLogout() {
    try {
        await supabase.auth.signOut();
    } catch (error) {
        console.error('Logout error:', error);
    } finally {
        // Redirect based on current page path
        const path = window.location.pathname;
        if (path.includes('/freelancer/')) {
            window.location.href = "../auth/freelancer-login.html";
        } else if (path.includes('/client/')) {
            window.location.href = "../auth/client-login.html";
        } else {
            window.location.href = "../auth/login.html";
        }
    }
}

// Attach listeners
document.addEventListener("DOMContentLoaded", () => {
    // Signup forms
    const freelancerForm = document.getElementById("freelancerSignupForm");
    if (freelancerForm) {
        freelancerForm.addEventListener("submit", handleFreelancerSignup);
        loadSkills("skillsCheckboxContainer");
        populateCountryDropdown("country");
        setupPhoneValidation();
    }

    const clientForm = document.getElementById("clientSignupForm");
    if (clientForm) {
        clientForm.addEventListener("submit", handleClientSignup);
        populateCountryDropdown("country");
        setupPhoneValidation();
        // toggle business name field
        const accountType = document.getElementById('account_type');
        const businessNameGroup = document.getElementById('businessNameGroup');
        if (accountType && businessNameGroup) {
            accountType.addEventListener('change', function() {
                if (this.value === 'business') {
                    businessNameGroup.style.display = 'block';
                    document.getElementById('business_name').setAttribute('required', 'required');
                } else {
                    businessNameGroup.style.display = 'none';
                    document.getElementById('business_name').removeAttribute('required');
                }
            });
        }
    }

    // Login forms
    const freelancerLoginForm = document.getElementById("freelancerLoginForm");
    if (freelancerLoginForm) freelancerLoginForm.addEventListener("submit", handleFreelancerLogin);

    const clientLoginForm = document.getElementById("clientLoginForm");
    if (clientLoginForm) clientLoginForm.addEventListener("submit", handleClientLogin);

    // Logout links
    document.querySelectorAll('.logout').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            handleLogout();
        });
    });
});

export { handleLogout };