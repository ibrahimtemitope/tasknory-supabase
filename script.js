// script.js — SUPABASE VERSION
// Landing page script. Only the newsletter/waitlist API calls changed.
// Import the global Supabase client
import { supabase } from './api.js';

/**
 * TASKNORY V3 - AFRICAN AI SPECIALIST INTERACTION SYSTEM
 */

document.addEventListener('DOMContentLoaded', () => {
    initLoadingScreen();
    initThemeToggle();
    initMobileNavigation();
    initScrollAnimations();
    initCounters();
    initSmoothScroll();
    initNavbarBehavior();
    initParallaxEffects();
    initCurrentYear();
    initNewsletterForm();
    initNicheWaitlistForm();
    fetchWaitlistCount();
});

function initLoadingScreen() {
    const loader = document.getElementById('loadingScreen');
    const progress = document.querySelector('.loading-progress');
    if (!loader) return;

    let width = 0;
    const interval = setInterval(() => {
        if (width >= 100) {
            clearInterval(interval);
            setTimeout(() => {
                loader.style.opacity = '0';
                loader.style.visibility = 'hidden';
                document.body.classList.add('loaded');
            }, 500);
        } else {
            width += Math.random() * 30 + 10;
            if (width > 100) width = 100;
            progress.style.width = width + '%';
        }
    }, 200);
}

function initThemeToggle() {
    const toggle = document.getElementById('themeToggle');
    const html = document.documentElement;

    const savedTheme = localStorage.getItem('tasknory-theme');
    const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

    if (savedTheme === 'light' || (!savedTheme && !systemPrefersDark)) {
        html.setAttribute('data-theme', 'light');
    } else {
        html.setAttribute('data-theme', 'dark');
    }

    toggle?.addEventListener('click', () => {
        const currentTheme = html.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        html.setAttribute('data-theme', newTheme);
        localStorage.setItem('tasknory-theme', newTheme);
        toggle.style.transform = 'scale(0.95)';
        setTimeout(() => toggle.style.transform = '', 150);
    });
}

function initMobileNavigation() {
    const menuToggle = document.getElementById('menuToggle');
    const navMenu = document.getElementById('navMenu');
    const navLinks = navMenu?.querySelectorAll('.nav-link');

    if (!menuToggle || !navMenu) return;

    let isOpen = false;

    menuToggle.addEventListener('click', () => {
        isOpen = !isOpen;
        navMenu.classList.toggle('active', isOpen);
        const icon = menuToggle.querySelector('i');
        if (icon) {
            icon.className = isOpen ? 'fas fa-times' : 'fas fa-bars';
        }
        document.body.classList.toggle('no-scroll', isOpen);
    });

    navLinks?.forEach(link => {
        link.addEventListener('click', () => {
            if (isOpen) {
                isOpen = false;
                navMenu.classList.remove('active');
                menuToggle.querySelector('i').className = 'fas fa-bars';
                document.body.classList.remove('no-scroll');
            }
        });
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && isOpen) {
            menuToggle.click();
        }
    });
}

function initScrollAnimations() {
    const observerOptions = {
        root: null,
        rootMargin: '0px 0px -100px 0px',
        threshold: 0.1
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('animate-in');
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';

                const children = entry.target.querySelectorAll('.stagger-child');
                children.forEach((child, index) => {
                    setTimeout(() => {
                        child.style.opacity = '1';
                        child.style.transform = 'translateY(0)';
                    }, index * 100);
                });

                observer.unobserve(entry.target);
            }
        });
    }, observerOptions);

    const animatedElements = document.querySelectorAll(`
        .section-header,
        .process-step,
        .feature-card,
        .feature-block,
        .why-card,
        .pricing-card,
        .case-study-card,
        .term-item
    `);

    animatedElements.forEach((el, index) => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(30px)';
        el.style.transition = `opacity 0.6s cubic-bezier(0.4, 0, 0.2, 1) ${index * 0.05}s, 
                               transform 0.6s cubic-bezier(0.4, 0, 0.2, 1) ${index * 0.05}s`;
        observer.observe(el);
    });
}

function initCounters() {
    const counters = document.querySelectorAll('.stat-number[data-count]');

    const counterObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const target = entry.target;
                const countTo = parseInt(target.getAttribute('data-count'));
                const duration = 2000;
                const startTime = performance.now();
                const startValue = 0;

                function updateCounter(currentTime) {
                    const elapsed = currentTime - startTime;
                    const progress = Math.min(elapsed / duration, 1);
                    const easeOutQuart = 1 - Math.pow(1 - progress, 4);
                    const current = Math.floor(startValue + (countTo - startValue) * easeOutQuart);
                    target.textContent = current.toLocaleString();

                    if (progress < 1) {
                        requestAnimationFrame(updateCounter);
                    } else {
                        target.textContent = countTo.toLocaleString() + '+';
                    }
                }

                requestAnimationFrame(updateCounter);
                counterObserver.unobserve(target);
            }
        });
    }, { threshold: 0.5 });

    counters.forEach(counter => counterObserver.observe(counter));
}

function initSmoothScroll() {
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                const headerOffset = 80;
                const elementPosition = target.getBoundingClientRect().top;
                const offsetPosition = elementPosition + window.pageYOffset - headerOffset;

                window.scrollTo({ top: offsetPosition, behavior: 'smooth' });
                history.pushState(null, null, this.getAttribute('href'));
            }
        });
    });
}

function initNavbarBehavior() {
    const nav = document.getElementById('mainNav');
    let lastScroll = 0;
    let ticking = false;

    window.addEventListener('scroll', () => {
        if (!ticking) {
            window.requestAnimationFrame(() => {
                const currentScroll = window.pageYOffset;

                if (currentScroll > 50) {
                    nav.style.boxShadow = '0 4px 20px rgba(0,0,0,0.3)';
                } else {
                    nav.style.boxShadow = 'none';
                }

                if (currentScroll > lastScroll && currentScroll > 500) {
                    nav.style.transform = 'translateY(-100%)';
                } else {
                    nav.style.transform = 'translateY(0)';
                }

                lastScroll = currentScroll;
                ticking = false;
            });
            ticking = true;
        }
    }, { passive: true });
}

function initParallaxEffects() {
    const orbs = document.querySelectorAll('.hero-orb, .cta-orb');
    let ticking = false;

    window.addEventListener('scroll', () => {
        if (!ticking) {
            window.requestAnimationFrame(() => {
                const scrolled = window.pageYOffset;
                orbs.forEach((orb, index) => {
                    const speed = 0.5 + (index * 0.2);
                    const yPos = -(scrolled * speed);
                    orb.style.transform = `translateY(${yPos}px)`;
                });
                ticking = false;
            });
            ticking = true;
        }
    }, { passive: true });
}

function initCurrentYear() {
    const yearSpan = document.getElementById('currentYear');
    if (yearSpan) yearSpan.textContent = new Date().getFullYear();
}

// Magnetic button effect for desktop
if (window.matchMedia('(pointer: fine)').matches) {
    document.querySelectorAll('.btn-primary, .btn-secondary').forEach(btn => {
        btn.addEventListener('mousemove', (e) => {
            const rect = btn.getBoundingClientRect();
            const x = e.clientX - rect.left - rect.width / 2;
            const y = e.clientY - rect.top - rect.height / 2;
            btn.style.transform = `translate(${x * 0.1}px, ${y * 0.1}px)`;
        });

        btn.addEventListener('mouseleave', () => {
            btn.style.transform = '';
        });
    });
}

// Debounce utility
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => { clearTimeout(timeout); func(...args); };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Handle resize
const handleResize = debounce(() => {
    const navMenu = document.getElementById('navMenu');
    const menuToggle = document.getElementById('menuToggle');
    if (window.innerWidth > 768 && navMenu?.classList.contains('active')) {
        navMenu.classList.remove('active');
        if (menuToggle) menuToggle.querySelector('i').className = 'fas fa-bars';
        document.body.classList.remove('no-scroll');
    }
}, 250);

window.addEventListener('resize', handleResize);

// Handle orientation change
window.addEventListener('orientationchange', () => {
    setTimeout(() => {
        handleResize();
        window.scrollTo(0, 0);
    }, 100);
});

// Prevent double-tap zoom on buttons (iOS)
document.querySelectorAll('.btn, .nav-link, .floating-btn, .slider-btn').forEach(el => {
    el.addEventListener('touchend', (e) => {
        e.preventDefault();
        el.click();
    }, { passive: false });
});

// Lazy loading images
const imageObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            const img = entry.target;
            img.src = img.dataset.src;
            img.classList.remove('lazy');
            imageObserver.unobserve(img);
        }
    });
});

document.querySelectorAll('img[data-src]').forEach(img => imageObserver.observe(img));

// Visibility change
document.addEventListener('visibilitychange', () => {
    document.body.classList.toggle('tab-hidden', document.hidden);
});

// ===================== NEWSLETTER & NICHE WAITLIST =====================

function initNewsletterForm() {
    const form = document.getElementById('newsletterForm');
    const emailInput = document.getElementById('newsletterEmail');
    const submitBtn = document.getElementById('newsletterSubmit');
    const note = document.getElementById('newsletterNote');

    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const email = emailInput.value.trim();
        if (!email) {
            showNewsletterMessage('Please enter your email.', 'error');
            return;
        }

        // Loading state
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

        try {
            // Insert directly into Supabase (public insert allowed by RLS)
            const { data, error } = await supabase
                .from('newsletter_subscriber')
                .insert({
                    email: email.toLowerCase(),
                    name: '',
                    user_type: 'visitor'
                })
                .select()
                .single();

            if (error) {
                // Check if it's a duplicate (unique constraint violation)
                if (error.code === '23505') {
                    showNewsletterMessage('You are already subscribed!', 'success');
                } else {
                    throw error;
                }
            } else {
                showNewsletterMessage('Successfully subscribed! You will receive updates at ' + email, 'success');
                emailInput.value = '';
                submitBtn.innerHTML = '<i class="fas fa-check"></i>';
                submitBtn.style.background = 'var(--success-green)';
            }

        } catch (error) {
            console.error('Newsletter error:', error);
            showNewsletterMessage('Something went wrong. Please try again.', 'error');
            submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i>';
        }

        setTimeout(() => {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i>';
            submitBtn.style.background = '';
        }, 3000);
    });
}

function showNewsletterMessage(message, type) {
    const note = document.getElementById('newsletterNote');
    if (!note) return;

    note.textContent = message;
    note.style.color = type === 'success' ? 'var(--success-green)' : 'var(--danger-red)';

    setTimeout(() => {
        note.textContent = 'No spam. Unsubscribe anytime.';
        note.style.color = '';
    }, 5000);
}

function initNicheWaitlistForm() {
    const form = document.getElementById('nicheWaitlistForm');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const email = document.getElementById('nicheEmail').value.trim();
        const name = document.getElementById('nicheName').value.trim();
        const niche = document.getElementById('desiredNiche').value.trim();
        const role = document.getElementById('currentRole').value;

        if (!email || !niche) {
            showNicheMessage('Please fill in all required fields.', 'error');
            return;
        }

        const submitBtn = form.querySelector('button[type="submit"]');
        const originalText = submitBtn.innerHTML;
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Joining...';

        try {
            // Insert directly into Supabase (public insert allowed by RLS)
            const { data, error } = await supabase
                .from('niche_waitlist')
                .insert({
                    email: email.toLowerCase(),
                    name: name,
                    desired_niche: niche,
                    current_role: role
                })
                .select()
                .single();

            if (error) {
                // Check if it's a duplicate (unique constraint violation)
                if (error.code === '23505') {
                    showNicheMessage('You are already on the waitlist for "' + niche + '"!', 'success');
                } else {
                    throw error;
                }
            } else {
                showNicheMessage('You are on the list! We will email you when "' + niche + '" opens on Tasknory.', 'success');
                form.reset();
                submitBtn.innerHTML = '<i class="fas fa-check"></i> You are on the list!';
            }

        } catch (error) {
            console.error('Waitlist error:', error);
            showNicheMessage('Something went wrong. Please try again.', 'error');
            submitBtn.innerHTML = originalText;
        }

        setTimeout(() => {
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalText;
        }, 4000);
    });
}

function showNicheMessage(message, type) {
    const form = document.getElementById('nicheWaitlistForm');
    let msgEl = form.querySelector('.niche-message');

    if (!msgEl) {
        msgEl = document.createElement('p');
        msgEl.className = 'niche-message';
        msgEl.style.marginTop = '1rem';
        msgEl.style.fontSize = '0.9rem';
        msgEl.style.fontWeight = '600';
        form.appendChild(msgEl);
    }

    msgEl.textContent = message;
    msgEl.style.color = type === 'success' ? 'var(--success-green)' : 'var(--danger-red)';

    setTimeout(() => {
        if (msgEl.parentNode) msgEl.parentNode.removeChild(msgEl);
    }, 6000);
}

async function fetchWaitlistCount() {
    const countEl = document.getElementById('waitlistCount');
    if (!countEl) return;

    try {
        // Count all waitlist entries using headless count
        const { count, error } = await supabase
            .from('niche_waitlist')
            .select('*', { count: 'exact', head: true });

        if (error) throw error;

        if (count !== null) {
            countEl.textContent = count + '+';
        } else {
            countEl.textContent = '500+';
        }
    } catch (e) {
        console.error('Waitlist count error:', e);
        countEl.textContent = '500+';
    }
}