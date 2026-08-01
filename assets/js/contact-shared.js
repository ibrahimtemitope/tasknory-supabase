// contact-shared.js — SUPABASE VERSION
import { supabase, getCurrentUser } from './api.js';

export const CONTACT_CATEGORIES = {
    freelancer: [
        { value: 'account_verification', label: 'Account Verification Issues' },
        { value: 'payment_help', label: 'Payment & Fees Help' },
        { value: 'profile_support', label: 'Profile & Portfolio Support' },
        { value: 'job_matching', label: 'Job Matching Questions' },
        { value: 'technical_support', label: 'Technical Support' },
        { value: 'feature_request', label: 'Feature Requests' },
        { value: 'dispute', label: 'Dispute Resolution' },
        { value: 'other', label: 'Other Issues' }
    ],
    client: [
        { value: 'hiring_help', label: 'Hiring Process Help' },
        { value: 'payment_issues', label: 'Payment Problems' },
        { value: 'freelancer_issues', label: 'Freelancer Issues' },
        { value: 'account_support', label: 'Account Support' },
        { value: 'technical_support', label: 'Technical Support' },
        { value: 'feature_request', label: 'Feature Requests' },
        { value: 'refund_request', label: 'Refund Requests' },
        { value: 'other', label: 'Other Issues' }
    ]
};

// Submit contact form
export async function submitContactForm(formData, userType) {
    try {
        // Get current user if logged in
        let userId = null;
        try {
            const user = await getCurrentUser();
            if (user) userId = user.id;
        } catch (e) {
            // Not logged in – continue as guest
        }

        const contactData = {
            user_id: userId,
            user_type: userType,
            name: formData.get('name'),
            email: formData.get('email'),
            subject: formData.get('subject'),
            message: formData.get('message'),
            category: formData.get('category'),
            status: 'new',
            allow_user_response: false
        };

        const { data, error } = await supabase
            .from('contact_message')
            .insert(contactData)
            .select()
            .single();
        if (error) throw error;

        return data;
    } catch (error) {
        throw new Error(error.message || 'Failed to submit contact form');
    }
}

// Get user's contact history
export async function getUserContactHistory() {
    try {
        const user = await getCurrentUser();
        if (!user) return [];

        const { data: tickets, error } = await supabase
            .from('contact_message')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false });
        if (error) throw error;

        return tickets || [];
    } catch (error) {
        console.error('Error fetching contact history:', error);
        return [];
    }
}

// Submit user follow-up response
export async function submitUserFollowUp(messageId, followUpMessage) {
    try {
        const { data, error } = await supabase
            .from('contact_message')
            .update({
                user_follow_up: followUpMessage,
                user_follow_up_at: new Date().toISOString(),
                allow_user_response: false,
                status: 'in_progress'
            })
            .eq('id', messageId)
            .select()
            .single();
        if (error) throw error;

        return data;
    } catch (error) {
        throw new Error(error.message || 'Failed to submit follow-up');
    }
}