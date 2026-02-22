import { supabaseAdmin } from '../utils/supabase';

const BUCKET_NAME = 'workout-files';

export const storageService = {
  /**
   * Upload a workout file to Supabase Storage
   */
  async uploadWorkoutFile(
    athleteId: string,
    workoutId: string,
    format: 'zwo' | 'fit',
    content: string | Buffer
  ): Promise<string> {
    const filePath = `${athleteId}/${workoutId}.${format}`;

    // Convert string to buffer if needed
    const buffer = typeof content === 'string' ? Buffer.from(content, 'utf-8') : content;

    // Set content type based on format
    const contentType = format === 'zwo' ? 'application/xml' : 'application/octet-stream';

    // Upload to Supabase Storage
    const { error } = await supabaseAdmin.storage
      .from(BUCKET_NAME)
      .upload(filePath, buffer, {
        contentType,
        upsert: true, // Replace if exists
      });

    if (error) {
      throw new Error(`Failed to upload ${format} file: ${error.message}`);
    }

    // Get public URL
    const { data } = supabaseAdmin.storage.from(BUCKET_NAME).getPublicUrl(filePath);

    return data.publicUrl;
  },

  /**
   * Delete workout files from storage
   */
  async deleteWorkoutFiles(athleteId: string, workoutId: string): Promise<void> {
    const files = [`${athleteId}/${workoutId}.zwo`, `${athleteId}/${workoutId}.fit`];

    const { error } = await supabaseAdmin.storage.from(BUCKET_NAME).remove(files);

    if (error) {
      console.error('Error deleting workout files:', error);
      // Don't throw error - files might not exist
    }
  },

  /**
   * Get signed URL for a workout file (for temporary access)
   */
  async getSignedUrl(
    athleteId: string,
    workoutId: string,
    format: 'zwo' | 'fit',
    expiresIn: number = 3600
  ): Promise<string> {
    const filePath = `${athleteId}/${workoutId}.${format}`;

    const { data, error } = await supabaseAdmin.storage
      .from(BUCKET_NAME)
      .createSignedUrl(filePath, expiresIn);

    if (error) {
      throw new Error(`Failed to get signed URL: ${error.message}`);
    }

    return data.signedUrl;
  },

  /**
   * Check if bucket exists and create if needed
   */
  async ensureBucketExists(): Promise<void> {
    const { data: buckets } = await supabaseAdmin.storage.listBuckets();
    const bucketExists = buckets?.some((b) => b.name === BUCKET_NAME);

    if (!bucketExists) {
      const { error } = await supabaseAdmin.storage.createBucket(BUCKET_NAME, {
        public: true,
        fileSizeLimit: 1048576, // 1MB limit
      });

      if (error) {
        console.error('Error creating bucket:', error);
      }
    }
  },
};
