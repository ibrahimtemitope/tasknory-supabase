// ==========================================
// FLOW TAB SWITCHER — How It Works dual flow
// ==========================================

function switchFlowTab(button) {
    const tab = button.getAttribute('data-tab');

    // Update buttons
    document.querySelectorAll('.flow-tab').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-tab') === tab);
    });

    // Update panels — FIX: handle display property
    document.querySelectorAll('.flow-panel').forEach(panel => {
        const isTarget = panel.id === 'flow-' + tab;
        panel.classList.toggle('active', isTarget);
        panel.style.display = isTarget ? 'block' : 'none';
    });
}

// ==========================================
// INIT: Set correct initial state on load
// ==========================================

function initFlowTabs() {
    document.querySelectorAll('.flow-panel').forEach(panel => {
        panel.style.display = panel.classList.contains('active') ? 'block' : 'none';
    });
}

// ==========================================
// SCROLL ANIMATIONS FOR NEW SECTIONS
// ==========================================

function initNewSectionAnimations() {
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
                observer.unobserve(entry.target);
            }
        });
    }, observerOptions);

    const newElements = document.querySelectorAll(`
        .hero-path-card,
        .way-card,
        .flow-tab
    `);

    newElements.forEach((el, index) => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(30px)';
        el.style.transition = `opacity 0.6s cubic-bezier(0.4, 0, 0.2, 1) ${index * 0.08}s, 
                               transform 0.6s cubic-bezier(0.4, 0, 0.2, 1) ${index * 0.08}s`;
        observer.observe(el);
    });
}

// Initialize on DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        initFlowTabs();
        initNewSectionAnimations();
    });
} else {
    initFlowTabs();
    initNewSectionAnimations();
}