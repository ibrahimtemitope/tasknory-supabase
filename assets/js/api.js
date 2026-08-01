// api.js — SUPABASE GLOBAL CLIENT
// Single source of truth for Supabase. All other files import from here.

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = 'https://kzvjrnxesxvlonrplptz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt6dmpybnhlc3h2bG9ucnBscHR6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU1NDIxMDYsImV4cCI6MjEwMTExODEwNn0.d-OLhS_hWv8PECpnkvvU6cfKVX4MPwZAUk9X0dgRaMo';

// Create and configure the global Supabase client
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true
    },
    realtime: {
        timeout: 20000
    }
});

// Storage bucket public URL base (for constructing image URLs from stored paths)
export const STORAGE_BASE = `${SUPABASE_URL}/storage/v1/object/public`;

// Helper: get the currently logged-in user + their public profile in one call
// Redirects to login if not authenticated
export async function getCurrentUser(redirectOnFail = true) {
    const { data: { user: authUser }, error: authError } = await supabase.auth.getUser();
    if (authError || !authUser) {
        if (redirectOnFail) window.location.href = 'login.html';
        return null;
    }

    const { data: profile, error: profileError } = await supabase
        .from('users')
        .select(`*, main_badge:main_badge_id(*)`)
        .eq('id', authUser.id)
        .single();

    if (profileError) {
        console.error('Profile fetch error:', profileError);
        if (redirectOnFail) window.location.href = 'login.html';
        return null;
    }
    return profile;
}

// Helper: upload a file to a Supabase Storage bucket
// Returns the public URL string on success, throws on error
export async function uploadFile(bucket, filePath, file) {
    const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(filePath, file, { upsert: true });
    if (uploadError) throw uploadError;

    const { data: urlData } = supabase.storage
        .from(bucket)
        .getPublicUrl(filePath);
    return urlData.publicUrl;
}

// Helper: get a temporary signed URL for private buckets
export async function getSignedUrl(bucket, filePath, expiresIn = 3600) {
    const { data, error } = await supabase.storage
        .from(bucket)
        .createSignedUrl(filePath, expiresIn);
    if (error) throw error;
    return data.signedUrl;
}