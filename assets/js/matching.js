// Admin manual trigger for job matching (if needed)
import { supabase } from './api.js';

export async function runMatching(jobId) {
    try {
        // Approve the job first
        const { error: approveError } = await supabase
            .from('job')
            .update({ approved: true })
            .eq('id', jobId);
        if (approveError) throw approveError;

        // Run the matching PostgreSQL function
        const { error: matchError } = await supabase.rpc('run_job_matching', { p_job_id: jobId });
        if (matchError) throw matchError;

        console.log('Job approved and matching started');
        return { success: true };
    } catch (error) {
        console.error('Matching failed:', error);
        throw error;
    }
}