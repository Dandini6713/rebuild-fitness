export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

/**
 * Bootstrap types for the migration-free local public schema.
 * Run `npm run supabase:types` after Prompt 03 adds and applies migrations.
 * This deliberately exposes no tables until the database is created from reviewed migrations.
 */
export type Database = {
  public: {
    CompositeTypes: Record<never, never>;
    Enums: Record<never, never>;
    Functions: Record<never, never>;
    Tables: Record<never, never>;
    Views: Record<never, never>;
  };
};
