// admin-ui.js — SUPABASE VERSION
import { supabase, getCurrentUser } from './api.js';

async function requireAdmin() {
    try {
        const user = await getCurrentUser();
        if (!user || user.role !== 'admin') {
            window.location.href = "../client/login.html";
        }
    } catch (error) {
        console.error('Admin check error:', error);
        window.location.href = "../client/login.html";
    }
}

document.addEventListener("DOMContentLoaded", requireAdmin);

// Mobile menu and tab functionality
document.addEventListener('DOMContentLoaded', function() {
    const mobileMenuBtn = document.getElementById('mobileMenuBtn');
    const sidebar = document.getElementById('sidebar');

    if (mobileMenuBtn && sidebar) {
        mobileMenuBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            sidebar.classList.toggle('mobile-open');
            mobileMenuBtn.classList.toggle('active');

            if (sidebar.classList.contains('mobile-open')) {
                createOverlay();
            } else {
                removeOverlay();
            }
        });

        function createOverlay() {
            removeOverlay();
            const overlay = document.createElement('div');
            overlay.className = 'mobile-overlay';
            overlay.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.5);
                z-index: 999;
                backdrop-filter: blur(2px);
            `;
            overlay.addEventListener('click', closeMobileMenu);
            document.body.appendChild(overlay);
            document.body.style.overflow = 'hidden';
        }

        function removeOverlay() {
            const existingOverlay = document.querySelector('.mobile-overlay');
            if (existingOverlay) {
                existingOverlay.remove();
            }
            document.body.style.overflow = '';
        }

        function closeMobileMenu() {
            sidebar.classList.remove('mobile-open');
            mobileMenuBtn.classList.remove('active');
            removeOverlay();
        }

        document.querySelectorAll('.nav-link').forEach((link) => {
            link.addEventListener('click', closeMobileMenu);
        });

        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape' && sidebar.classList.contains('mobile-open')) {
                closeMobileMenu();
            }
        });

        window.addEventListener('resize', function() {
            if (window.innerWidth > 768 && sidebar.classList.contains('mobile-open')) {
                closeMobileMenu();
            }
        });
    }

    // Tab navigation
    const tabButtons = document.querySelectorAll('.admin-nav button');
    const tabContents = document.querySelectorAll('.tab-content');

    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            tabButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            tabContents.forEach(content => content.classList.remove('active'));
            const tabId = button.getAttribute('data-tab');
            const tabContent = document.getElementById(tabId);
            if (tabContent) {
                tabContent.classList.add('active');
            }
        });
    });
});

// Theme Toggle
function initThemeToggle() {
    const themeToggle = document.getElementById('themeToggle');
    if (!themeToggle) return;

    const themeIcon = themeToggle.querySelector('.theme-icon');
    const themeLabel = themeToggle.querySelector('.theme-label');

    const savedTheme = localStorage.getItem('admin-theme');
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
            localStorage.setItem('admin-theme', 'dark');
        } else {
            document.documentElement.setAttribute('data-theme', 'light');
            themeIcon.textContent = '🌙';
            themeLabel.textContent = 'Dark Mode';
            localStorage.setItem('admin-theme', 'light');
        }
    });
}

document.addEventListener('DOMContentLoaded', initThemeToggle);