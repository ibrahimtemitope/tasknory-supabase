import { supabase, STORAGE_BASE } from './api.js';

class ChatApp {
    constructor() {
        this.currentUser = null;
        this.chatPartner = null;
        this.userRole = null;
        this.chatRole = null;
        this.hireId = new URLSearchParams(window.location.search).get("hire");
        this.reconnecting = false;
        this.reconnectAttempts = 0;
        this.intentionalClose = false;
        this.lastMessageTime = Date.now();
        this.channel = null;

        this.initializeElements();
        this.setupAndroidFixes();
        this.bindEvents();
    }

    initializeElements() {
        // Navigation elements
        this.sidebar = document.getElementById('sidebar');
        this.navMenu = document.getElementById('navMenu');
        this.menuToggle = document.getElementById('menuToggle');
        this.closeSidebar = document.getElementById('closeSidebar');

        // Header elements
        this.pageTitle = document.getElementById('pageTitle');
        this.pageSubtitle = document.getElementById('pageSubtitle');

        // Chat elements
        this.partnerName = document.getElementById('partnerName');
        this.partnerRole = document.getElementById('partnerRole');
        this.messagesContainer = document.getElementById('messagesContainer');
        this.messages = document.getElementById('messages');
        this.messageForm = document.getElementById('messageForm');
        this.messageInput = document.getElementById('messageInput');
        this.sendButton = document.getElementById('sendButton');

        this.connectionStatus = this.createConnectionStatus();

        if (window.innerWidth <= 768) {
            this.sidebar.classList.remove('open');
        }
    }

    bindEvents() {
        this.setupMenuToggle();
        this.setupCloseSidebar();
        this.messageForm?.addEventListener('submit', (e) => this.handleMessageSubmit(e));
        document.addEventListener('click', (e) => this.handleOutsideClick(e));
        document.addEventListener('touchstart', (e) => this.handleOutsideClick(e));
        window.addEventListener('resize', () => this.handleResize());
    }

    setupMenuToggle() {
        if (!this.menuToggle) return;
        const newToggle = this.menuToggle.cloneNode(true);
        this.menuToggle.parentNode.replaceChild(newToggle, this.menuToggle);
        this.menuToggle = newToggle;

        const toggleMenu = (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.toggleSidebar();
        };

        this.menuToggle.addEventListener('click', toggleMenu);
        this.menuToggle.addEventListener('touchstart', (e) => {
            e.preventDefault();
            this.menuToggle.style.backgroundColor = 'var(--brand-blue)';
            this.menuToggle.style.opacity = '0.8';
        }, { passive: false });

        this.menuToggle.addEventListener('touchend', (e) => {
            e.preventDefault();
            toggleMenu(e);
            this.menuToggle.style.backgroundColor = '';
            this.menuToggle.style.opacity = '';
        }, { passive: false });

        this.menuToggle.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    setupCloseSidebar() {
        if (!this.closeSidebar) return;
        const closeMenu = (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.closeSidebarMenu();
        };
        this.closeSidebar.addEventListener('click', closeMenu);
        this.closeSidebar.addEventListener('touchstart', closeMenu, { passive: false });
    }

    async init() {
        if (!this.hireId) {
            this.showError("Invalid chat link. Missing hire ID.");
            return;
        }

        try {
            // Get current user
            this.currentUser = await this.getCurrentUser();
            if (!this.currentUser) throw new Error("Authentication required");

            this.initThemeToggle();

            await this.determineUserRole();
            await this.setupNavigation();
            await this.loadHireDetails();
            await this.loadMessages();

            // Setup Supabase Realtime connection
            this.setupRealtime();

            this.setupButtonRecovery();
        } catch (error) {
            console.error('Init error:', error);
            this.showError(error.message || "Failed to initialize chat");
        }
    }

    async getCurrentUser() {
        const { data: { user: authUser }, error: authError } = await supabase.auth.getUser();
        if (authError || !authUser) {
            window.location.href = 'login.html';
            return null;
        }
        const { data: userData, error } = await supabase
            .from('users')
            .select('*')
            .eq('id', authUser.id)
            .single();
        if (error) {
            console.error('Profile fetch error:', error);
            window.location.href = 'login.html';
            return null;
        }
        return userData;
    }

    async determineUserRole() {
        this.userRole = this.currentUser.role;
        console.log('Determined user role:', this.userRole);
    }

    async setupNavigation() {
        if (!this.userRole) return;
        let navItems;
        if (this.userRole === 'admin') {
            navItems = this.getAdminNav();
        } else if (this.userRole === 'client') {
            navItems = this.getClientNav();
        } else {
            navItems = this.getFreelancerNav();
        }
        if (this.navMenu) this.navMenu.innerHTML = navItems;
        this.updateLayout();
    }

    getAdminNav() {
        return `
            <li class="nav-item">
                <a href="../admin/dashboard.html" class="nav-link">
                    <span class="nav-icon">📊</span>
                    <span>Admin Dashboard</span>
                </a>
            </li>
            <li class="nav-item">
                <a href="../client/dashboard.html" class="nav-link">
                    <span class="nav-icon">👨‍💼</span>
                    <span>Client View</span>
                </a>
            </li>
            <li class="nav-item">
                <a href="../freelancer/dashboard.html" class="nav-link">
                    <span class="nav-icon">👩‍💻</span>
                    <span>Freelancer View</span>
                </a>
            </li>
            <li class="nav-item">
                <a href="../admin/users.html" class="nav-link">
                    <span class="nav-icon">👥</span>
                    <span>User Management</span>
                </a>
            </li>
            <li class="nav-item">
                <a href="../admin/messages.html" class="nav-link active">
                    <span class="nav-icon">💬</span>
                    <span>Messages</span>
                </a>
            </li>
            <li class="nav-item">
                <a href="../auth/logout.html" class="nav-link logout">
                    <span class="nav-icon">🚪</span>
                    <span>Logout</span>
                </a>
            </li>
        `;
    }

    getClientNav() {
        return `
            <li class="nav-item">
                <a href="../client/dashboard.html" class="nav-link">
                    <span class="nav-icon">📊</span>
                    <span>Dashboard</span>
                </a>
            </li>
            <li class="nav-item">
                <a href="../client/matches.html" class="nav-link">
                    <span class="nav-icon">🔍</span>
                    <span>Matches</span>
                </a>
            </li>
            <li class="nav-item">
                <a href="../client/hires.html" class="nav-link">
                    <span class="nav-icon">👥</span>
                    <span>My Hires</span>
                </a>
            </li>
            <li class="nav-item">
                <a href="../client/contracts.html" class="nav-link">
                    <span class="nav-icon">📝</span>
                    <span>Contracts</span>
                </a>
            </li>
            <li class="nav-item">
                <a href="../client/messages.html" class="nav-link active">
                    <span class="nav-icon">💬</span>
                    <span>Messages</span>
                </a>
            </li>
            <li class="nav-item">
                <a href="../auth/logout.html" class="nav-link logout">
                    <span class="nav-icon">🚪</span>
                    <span>Logout</span>
                </a>
            </li>
        `;
    }

    getFreelancerNav() {
        return `
            <li class="nav-item">
                <a href="../freelancer/dashboard.html" class="nav-link">
                    <span class="nav-icon">📊</span>
                    <span>Dashboard</span>
                </a>
            </li>
            <li class="nav-item">
                <a href="../freelancer/portfolio.html" class="nav-link">
                    <span class="nav-icon">💼</span>
                    <span>Portfolio</span>
                </a>
            </li>
            <li class="nav-item">
                <a href="../freelancer/jobs.html" class="nav-link">
                    <span class="nav-icon">🔍</span>
                    <span>Jobs</span>
                </a>
            </li>
            <li class="nav-item">
                <a href="../freelancer/hires.html" class="nav-link">
                    <span class="nav-icon">👥</span>
                    <span>Hires</span>
                </a>
            </li>
            <li class="nav-item">
                <a href="../freelancer/messages.html" class="nav-link active">
                    <span class="nav-icon">💬</span>
                    <span>Messages</span>
                </a>
            </li>
            <li class="nav-item">
                <a href="../auth/logout.html" class="nav-link logout">
                    <span class="nav-icon">🚪</span>
                    <span>Logout</span>
                </a>
            </li>
        `;
    }

    async loadHireDetails() {
        try {
            const { data: hire, error } = await supabase
                .from('hire')
                .select(`
                    *,
                    job:job_id(*),
                    client:client_id(*),
                    freelancer:freelancer_id(*)
                `)
                .eq('id', this.hireId)
                .single();
            if (error || !hire) throw new Error("Hire not found");

            // Determine partner
            if (this.currentUser.id === hire.client_id) {
                this.chatPartner = hire.freelancer;
                this.chatRole = 'client';
            } else if (this.currentUser.id === hire.freelancer_id) {
                this.chatPartner = hire.client;
                this.chatRole = 'freelancer';
            } else if (this.userRole === 'admin') {
                this.chatPartner = hire.freelancer;
                this.chatRole = 'client';
            } else {
                throw new Error("Access denied");
            }
            this.updateChatHeader(hire);
            await this.loadPartnerAvatar();
        } catch (error) {
            console.error('Error loading hire details:', error);
            this.showError("Chat not found or access denied.");
        }
    }

    updateChatHeader(hire) {
        if (this.pageTitle) this.pageTitle.textContent = `Chat with ${this.chatPartner.full_name}`;
        if (this.pageSubtitle) this.pageSubtitle.textContent = hire.job.title;
        if (this.partnerName) {
            let nameHtml = this.chatPartner.full_name;
            if (this.userRole === 'admin') nameHtml += `<span class="admin-indicator">ADMIN</span>`;
            this.partnerName.innerHTML = nameHtml;
        }
        if (this.partnerRole) {
            this.partnerRole.textContent = `${this.chatRole === 'client' ? 'Freelancer' : 'Client'} • ${hire.job.title}`;
        }
    }

    async loadMessages() {
        try {
            const { data: messages, error } = await supabase
                .from('message')
                .select('*')
                .eq('hire_id', this.hireId)
                .order('created_at', { ascending: true });
            if (error) throw error;

            if (this.messages) {
                this.messages.innerHTML = '';
                if (!messages || messages.length === 0) {
                    this.showEmptyState();
                    return;
                }
                messages.forEach(message => this.appendMessage(message));
                this.scrollToBottom();
            }
        } catch (error) {
            console.error('Failed to load messages:', error);
            this.showError("Failed to load messages.");
        }
    }

    appendMessage(message) {
        if (!this.messages) return;
        const emptyState = this.messages.querySelector('.empty-chat');
        if (emptyState) emptyState.remove();

        if (message.id && this.isMessageDisplayed(message.id)) return;

        const messageEl = document.createElement('div');
        const senderId = message.sender_id || message.sender;
        messageEl.className = `message ${senderId === this.currentUser.id ? 'sent' : 'received'}`;
        messageEl.setAttribute('data-message-id', message.id);
        messageEl.setAttribute('data-timestamp', message.created_at);

        const time = new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        let statusIndicator = '';
        if (senderId === this.currentUser.id) {
            statusIndicator = '<div class="message-status">✓</div>';
        }

        messageEl.innerHTML = `
            <div class="message-content">${this.escapeHtml(message.content)}</div>
            <div class="message-time">${time} ${statusIndicator}</div>
        `;

        this.messages.appendChild(messageEl);
        this.scrollToBottom();
        this.lastMessageTime = Date.now();

        messageEl.classList.add('new-message');
        setTimeout(() => messageEl.classList.remove('new-message'), 300);
    }

    async handleMessageSubmit(e) {
        e.preventDefault();
        const content = this.messageInput.value.trim();
        if (!content) return;

        this.setSendButtonState(true);

        // Optimistic UI
        const tempMessage = {
            id: `temp-${Date.now()}`,
            hire_id: this.hireId,
            sender_id: this.currentUser.id,
            content: content,
            created_at: new Date().toISOString()
        };
        this.appendMessage(tempMessage);
        this.messageInput.value = '';
        this.messageForm.reset();

        try {
            const { data: realMessage, error } = await supabase
                .from('message')
                .insert({
                    hire_id: this.hireId,
                    sender_id: this.currentUser.id,
                    content: content
                })
                .select()
                .single();
            if (error) throw error;
            this.replaceTempMessage(tempMessage.id, realMessage);
        } catch (error) {
            console.error('Failed to send message:', error);
            this.showMessageError(tempMessage.id);
        } finally {
            this.setSendButtonState(false);
        }
    }

    replaceTempMessage(tempId, realMessage) {
        const tempMessageEl = document.querySelector(`[data-message-id="${tempId}"]`);
        if (tempMessageEl) {
            tempMessageEl.setAttribute('data-message-id', realMessage.id);
            tempMessageEl.classList.remove('pending');
        }
    }

    showMessageError(tempId) {
        const tempMessageEl = document.querySelector(`[data-message-id="${tempId}"]`);
        if (tempMessageEl) {
            tempMessageEl.classList.add('error');
            tempMessageEl.innerHTML = `
                <div class="message-content">Failed to send message</div>
                <div class="message-time">
                    <button onclick="this.closest('.message').remove()" style="background:none; border:none; color:var(--error-color); text-decoration:underline; cursor:pointer;">
                        Retry
                    </button>
                </div>
            `;
        }
    }

    setSendButtonState(sending) {
        if (!this.sendButton) return;
        this.sendButton.disabled = sending;
        if (sending) {
            this.sendButton.innerHTML = `
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 18a8 8 0 1 1 8-8 8 8 0 0 1-8 8z" opacity=".5"/>
                    <path d="M20 12h2A10 10 0 0 0 12 2v2a8 8 0 0 1 8 8z">
                        <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="1s" repeatCount="indefinite"/>
                    </path>
                </svg>
            `;
            this.sendButton.setAttribute('aria-label', 'Sending message...');
        } else {
            this.sendButton.innerHTML = `
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
                </svg>
            `;
            this.sendButton.setAttribute('aria-label', 'Send message');
        }
    }

    setupRealtime() {
        this.updateConnectionStatus('reconnecting');

        this.channel = supabase
            .channel(`hire:${this.hireId}`)
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'message',
                filter: `hire_id=eq.${this.hireId}`
            }, (payload) => {
                const msg = payload.new;
                // Only append if it's from the other person (we already show our own via optimistic UI)
                if (msg.sender_id !== this.currentUser.id) {
                    this.appendMessage({
                        id: msg.id,
                        sender_id: msg.sender_id,
                        content: msg.content,
                        created_at: msg.created_at
                    });
                }
            })
            .subscribe((status) => {
                if (status === 'SUBSCRIBED') {
                    console.log('Realtime subscribed');
                    this.updateConnectionStatus('connected');
                    this.reconnectAttempts = 0;
                } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
                    console.log('Realtime closed/error', status);
                    if (!this.intentionalClose) {
                        this.updateConnectionStatus('disconnected');
                        this.attemptReconnect();
                    }
                }
            });
    }

    attemptReconnect() {
        if (this.reconnecting) return;
        this.reconnecting = true;
        this.reconnectAttempts++;
        const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
        setTimeout(() => {
            this.reconnecting = false;
            this.setupRealtime();
        }, delay);
    }

    isMessageDisplayed(messageId) {
        return !!document.querySelector(`[data-message-id="${messageId}"]`);
    }

    toggleSidebar() {
        if (this.sidebar) {
            this.sidebar.classList.toggle('open');
            this.toggleOverlay(this.sidebar.classList.contains('open'));
        }
    }

    closeSidebarMenu() {
        if (this.sidebar) {
            this.sidebar.classList.remove('open');
            this.toggleOverlay(false);
        }
    }

    toggleOverlay(show) {
        let overlay = document.getElementById('sidebarOverlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.className = 'sidebar-overlay';
            overlay.id = 'sidebarOverlay';
            document.body.appendChild(overlay);
            overlay.addEventListener('click', () => this.closeSidebarMenu());
        }
        overlay.classList.toggle('active', show);
    }

    handleOutsideClick(e) {
        if (!this.sidebar || !this.sidebar.classList.contains('open')) return;
        const isMenuToggle = this.menuToggle && this.menuToggle.contains(e.target);
        const isSidebar = this.sidebar.contains(e.target);
        if (!isMenuToggle && !isSidebar) {
            this.closeSidebarMenu();
        }
    }

    handleResize() {
        if (window.innerWidth > 768) this.closeSidebarMenu();
        this.updateLayout();
    }

    updateLayout() {
        if (!this.sidebar) return;
        if (window.innerWidth > 768) {
            this.sidebar.style.transform = 'translateX(0)';
        } else {
            if (!this.sidebar.classList.contains('open')) {
                this.sidebar.style.transform = 'translateX(-100%)';
            }
        }
    }

    scrollToBottom() {
        setTimeout(() => {
            if (this.messagesContainer) {
                this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
            }
        }, 100);
    }

    showEmptyState() {
        if (!this.messages) return;
        this.messages.innerHTML = `
            <div class="empty-chat">
                <h3>No messages yet</h3>
                <p>Start the conversation by sending a message!</p>
            </div>
        `;
    }

    showError(message) {
        if (!this.messages) return;
        this.messages.innerHTML = `<div class="error">${message}</div>`;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    createConnectionStatus() {
        const statusEl = document.createElement('div');
        statusEl.className = 'connection-status';
        statusEl.textContent = 'Connecting...';
        document.body.appendChild(statusEl);
        return statusEl;
    }

    updateConnectionStatus(status) {
        if (!this.connectionStatus) return;
        this.connectionStatus.className = `connection-status ${status}`;
        switch(status) {
            case 'connected':
                this.connectionStatus.textContent = '🟢 Connected';
                break;
            case 'disconnected':
                this.connectionStatus.textContent = '🔴 Disconnected';
                break;
            case 'reconnecting':
                this.connectionStatus.textContent = '🟡 Reconnecting...';
                break;
        }
        if (status === 'connected') {
            setTimeout(() => {
                if (this.connectionStatus.classList.contains('connected')) {
                    this.connectionStatus.style.opacity = '0';
                }
            }, 3000);
        } else {
            this.connectionStatus.style.opacity = '1';
        }
    }

    initThemeToggle() {
        const themeToggle = document.getElementById('themeToggle');
        if (!themeToggle) return;
        const themeIcon = themeToggle.querySelector('.theme-icon');
        const themeLabel = themeToggle.querySelector('.theme-label');
        const savedTheme = localStorage.getItem('chat-theme');
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
                localStorage.setItem('chat-theme', 'dark');
            } else {
                document.documentElement.setAttribute('data-theme', 'light');
                themeIcon.textContent = '🌙';
                themeLabel.textContent = 'Dark Mode';
                localStorage.setItem('chat-theme', 'light');
            }
        });
    }

    async loadPartnerAvatar() {
        if (!this.chatPartner || !this.chatPartner.id) return;
        const avatarEl = document.querySelector(".partner-avatar");
        if (!avatarEl) return;

        avatarEl.classList.add('loading');
        try {
            let profilePicUrl = this.chatPartner.profile_picture;
            if (profilePicUrl && !profilePicUrl.startsWith('http')) {
                // If it's a relative path, construct Supabase Storage public URL
                profilePicUrl = `${STORAGE_BASE}/profile_pics/${profilePicUrl}`;
            }
            if (profilePicUrl) {
                const img = new Image();
                img.src = profilePicUrl;
                img.alt = "Partner Avatar";
                img.className = "avatar-img";

                img.onload = () => {
                    avatarEl.innerHTML = '';
                    avatarEl.appendChild(img);
                    avatarEl.classList.remove('loading');
                };

                img.onerror = () => {
                    avatarEl.classList.remove('loading');
                    avatarEl.classList.add('error');
                    console.error("Failed to load avatar image");
                };
            } else {
                avatarEl.classList.remove('loading');
                avatarEl.classList.add('error');
            }
        } catch (err) {
            console.error("Error loading partner avatar:", err);
            avatarEl.classList.remove('loading');
            avatarEl.classList.add('error');
        }
    }

    setupButtonRecovery() {
        setInterval(() => {
            if (this.sendButton && this.sendButton.disabled) {
                const loadingSVG = this.sendButton.querySelector('svg animateTransform');
                if (loadingSVG) {
                    const disabledTime = this.sendButtonDisabledSince || Date.now();
                    const timeDisabled = Date.now() - disabledTime;
                    if (timeDisabled > 10000) {
                        console.warn('Send button stuck, resetting...');
                        this.setSendButtonState(false);
                    }
                }
            }
        }, 10000);
    }

    setupAndroidFixes() {
        this.setViewportHeight();
        window.addEventListener('resize', () => this.setViewportHeight());
        window.addEventListener('orientationchange', () => {
            setTimeout(() => this.setViewportHeight(), 100);
        });
        this.enhanceTouchEvents();
    }

    setViewportHeight() {
        let vh = window.innerHeight * 0.01;
        document.documentElement.style.setProperty('--vh', `${vh}px`);
        const safeAreaInsetBottom = window.safeAreaInsets ? window.safeAreaInsets.bottom : 0;
        document.documentElement.style.setProperty('--safe-area-inset-bottom', `${safeAreaInsetBottom}px`);
    }

    enhanceTouchEvents() {
        if (this.menuToggle) {
            this.menuToggle.addEventListener('touchstart', (e) => {
                e.preventDefault();
                e.stopPropagation();
            }, { passive: false });
        }
        if (this.closeSidebar) {
            this.closeSidebar.addEventListener('touchstart', (e) => {
                e.preventDefault();
            }, { passive: false });
        }
    }

    destroy() {
        this.intentionalClose = true;
        if (this.channel) {
            supabase.removeChannel(this.channel);
            this.channel = null;
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const chatApp = new ChatApp();
    chatApp.init();
    window.addEventListener('beforeunload', () => chatApp.destroy());
});

// Global back function
window.goBack = function() {
    if (history.length > 1) {
        history.back();
    } else {
        window.location.href = "../dashboard.html";
    }
};