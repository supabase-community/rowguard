/**
 * Example database schema types
 *
 * Generate your own with:
 * npx supabase gen types typescript --project-id "$PROJECT_REF" > database.types.ts
 *
 * For local development:
 * npx supabase gen types typescript --local > database.types.ts
 */
export type Database = {
  public: {
    Tables: {
      notes: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          content: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          title: string;
          content: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          title?: string;
          content?: string;
          created_at?: string;
        };
      };
      profiles: {
        Row: {
          id: string;
          user_id: string;
          username: string;
          avatar_url: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          username: string;
          avatar_url?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          username?: string;
          avatar_url?: string | null;
        };
      };
    };
  };
};
