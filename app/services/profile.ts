// User / seller / driver profile access. Mirrors URide's UserProfileService pattern:
// thin static service over Supabase, keyed on Clerk id.

import { supabase } from '../config/supabase';
import { logger } from '../utils/logger';
import type { DriverRow, SellerRow, UserRole, UserRow } from '../types/database';

export class ProfileService {
  /** Fetch (or lazily create) the app user row for the signed-in Clerk user. */
  static async ensureUser(clerkId: string, email?: string | null): Promise<UserRow> {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('clerk_id', clerkId)
      .maybeSingle();
    if (error) {
      logger.error('Profile', 'ensureUser select failed', { error: error.message });
      throw error;
    }
    if (data) return data as UserRow;

    const { data: created, error: insertError } = await supabase
      .from('users')
      .insert({ clerk_id: clerkId, email: email ?? null })
      .select('*')
      .single();
    if (insertError) {
      // The Clerk webhook can create this row between our SELECT and INSERT.
      if (insertError.code === '23505') {
        const existing = await this.getUser(clerkId);
        if (existing) return existing;
      }
      logger.error('Profile', 'ensureUser insert failed', { error: insertError.message });
      throw insertError;
    }
    return created as UserRow;
  }

  static async getUser(clerkId: string): Promise<UserRow | null> {
    const { data, error } = await supabase.from('users').select('*').eq('clerk_id', clerkId).maybeSingle();
    if (error) throw error;
    return (data as UserRow) ?? null;
  }

  static async updateUser(userId: string, updates: Partial<UserRow>): Promise<boolean> {
    const { data, error } = await supabase.from('users').update(updates).eq('id', userId).select('id').maybeSingle();
    if (error) logger.error('Profile', 'updateUser failed', { error: error.message });
    return !error && !!data;
  }

  static async setRole(userId: string, role: UserRole): Promise<boolean> {
    return this.updateUser(userId, { role });
  }

  /** Seller record for a user (null if they never onboarded as a seller). */
  static async getSellerByUserId(userId: string): Promise<SellerRow | null> {
    const { data, error } = await supabase.from('sellers').select('*').eq('user_id', userId).maybeSingle();
    if (error) throw error;
    return (data as SellerRow) ?? null;
  }

  /** Driver record for a user (null if they never onboarded as a driver). */
  static async getDriverByUserId(userId: string): Promise<DriverRow | null> {
    const { data, error } = await supabase.from('drivers').select('*').eq('user_id', userId).maybeSingle();
    if (error) throw error;
    return (data as DriverRow) ?? null;
  }

  /** Upload a verification document to the private bucket; returns storage path. */
  static async uploadVerificationDoc(
    userId: string,
    kind: string,
    base64: string,
    contentType = 'image/jpeg'
  ): Promise<string | null> {
    const path = `${userId}/${kind}_${Date.now()}.jpg`;
    const { decode } = await import('base64-arraybuffer');
    const { error } = await supabase.storage
      .from('verification-docs')
      .upload(path, decode(base64), { contentType, upsert: true });
    if (error) {
      logger.error('Profile', 'doc upload failed', { kind, error: error.message });
      return null;
    }
    return path;
  }

  /** Upload a public listing image; returns public URL. */
  static async uploadListingImage(sellerId: string, base64: string): Promise<string | null> {
    const path = `${sellerId}/${Date.now()}.jpg`;
    const { decode } = await import('base64-arraybuffer');
    const { error } = await supabase.storage
      .from('listing-images')
      .upload(path, decode(base64), { contentType: 'image/jpeg', upsert: true });
    if (error) {
      logger.error('Profile', 'listing image upload failed', { error: error.message });
      return null;
    }
    return supabase.storage.from('listing-images').getPublicUrl(path).data.publicUrl;
  }
}
