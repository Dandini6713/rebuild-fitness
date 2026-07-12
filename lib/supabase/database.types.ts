export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      alcohol_logs: {
        Row: {
          abv_percent: number
          calories: number
          created_at: string
          drink_name: string
          drink_type: string | null
          id: string
          logged_at: string
          occasion_note: string | null
          units: number
          updated_at: string
          user_id: string
          volume_ml: number
        }
        Insert: {
          abv_percent: number
          calories: number
          created_at?: string
          drink_name: string
          drink_type?: string | null
          id?: string
          logged_at: string
          occasion_note?: string | null
          units: number
          updated_at?: string
          user_id: string
          volume_ml: number
        }
        Update: {
          abv_percent?: number
          calories?: number
          created_at?: string
          drink_name?: string
          drink_type?: string | null
          id?: string
          logged_at?: string
          occasion_note?: string | null
          units?: number
          updated_at?: string
          user_id?: string
          volume_ml?: number
        }
        Relationships: []
      }
      audit_events: {
        Row: {
          created_at: string
          details: Json
          entity_id: string | null
          entity_type: string | null
          event_type: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          details?: Json
          entity_id?: string | null
          entity_type?: string | null
          event_type: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          details?: Json
          entity_id?: string | null
          entity_type?: string | null
          event_type?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      body_measurements: {
        Row: {
          conditions_note: string | null
          created_at: string
          id: string
          measured_at: string
          measurement_type: Database["public"]["Enums"]["measurement_type"]
          unit: string
          updated_at: string
          user_id: string
          value: number
        }
        Insert: {
          conditions_note?: string | null
          created_at?: string
          id?: string
          measured_at: string
          measurement_type: Database["public"]["Enums"]["measurement_type"]
          unit: string
          updated_at?: string
          user_id: string
          value: number
        }
        Update: {
          conditions_note?: string | null
          created_at?: string
          id?: string
          measured_at?: string
          measurement_type?: Database["public"]["Enums"]["measurement_type"]
          unit?: string
          updated_at?: string
          user_id?: string
          value?: number
        }
        Relationships: []
      }
      exercise_logs: {
        Row: {
          created_at: string
          exercise_id: string
          exercise_order: number
          id: string
          user_id: string
          workout_log_id: string
        }
        Insert: {
          created_at?: string
          exercise_id: string
          exercise_order: number
          id?: string
          user_id: string
          workout_log_id: string
        }
        Update: {
          created_at?: string
          exercise_id?: string
          exercise_order?: number
          id?: string
          user_id?: string
          workout_log_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "exercise_logs_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exercise_logs_workout_log_id_user_id_fkey"
            columns: ["workout_log_id", "user_id"]
            isOneToOne: false
            referencedRelation: "workout_logs"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      exercises: {
        Row: {
          active: boolean
          beginner_setup: string | null
          body_region: string | null
          breathing: string | null
          category: string
          common_mistakes: string | null
          created_at: string
          equipment: string | null
          execution_steps: string | null
          id: string
          movement_pattern: string | null
          name: string
          slug: string
          starting_position: string | null
          stop_criteria: string | null
          substitution_options: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          beginner_setup?: string | null
          body_region?: string | null
          breathing?: string | null
          category: string
          common_mistakes?: string | null
          created_at?: string
          equipment?: string | null
          execution_steps?: string | null
          id?: string
          movement_pattern?: string | null
          name: string
          slug: string
          starting_position?: string | null
          stop_criteria?: string | null
          substitution_options?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          beginner_setup?: string | null
          body_region?: string | null
          breathing?: string | null
          category?: string
          common_mistakes?: string | null
          created_at?: string
          equipment?: string | null
          execution_steps?: string | null
          id?: string
          movement_pattern?: string | null
          name?: string
          slug?: string
          starting_position?: string | null
          stop_criteria?: string | null
          substitution_options?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      foods: {
        Row: {
          calories: number
          carbohydrate_g: number | null
          created_at: string
          fat_g: number | null
          favourite: boolean
          id: string
          name: string
          protein_g: number
          serving_description: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          calories: number
          carbohydrate_g?: number | null
          created_at?: string
          fat_g?: number | null
          favourite?: boolean
          id?: string
          name: string
          protein_g?: number
          serving_description?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          calories?: number
          carbohydrate_g?: number | null
          created_at?: string
          fat_g?: number | null
          favourite?: boolean
          id?: string
          name?: string
          protein_g?: number
          serving_description?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      goals: {
        Row: {
          created_at: string
          goal_type: string
          id: string
          is_active: boolean
          start_value: number | null
          target_date: string | null
          target_value: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          goal_type: string
          id?: string
          is_active?: boolean
          start_value?: number | null
          target_date?: string | null
          target_value?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          goal_type?: string
          id?: string
          is_active?: boolean
          start_value?: number | null
          target_date?: string | null
          target_value?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      health_context: {
        Row: {
          active: boolean
          body_area: string | null
          context_type: string
          created_at: string
          description: string | null
          id: string
          professional_restrictions: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          body_area?: string | null
          context_type: string
          created_at?: string
          description?: string | null
          id?: string
          professional_restrictions?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          active?: boolean
          body_area?: string | null
          context_type?: string
          created_at?: string
          description?: string | null
          id?: string
          professional_restrictions?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      nutrition_logs: {
        Row: {
          calories: number
          carbohydrate_g: number | null
          confidence: number | null
          created_at: string
          description: string
          fat_g: number | null
          food_id: string | null
          id: string
          logged_at: string
          meal_type: string
          protein_g: number
          serving_quantity: number
          source: string
          updated_at: string
          user_id: string
        }
        Insert: {
          calories: number
          carbohydrate_g?: number | null
          confidence?: number | null
          created_at?: string
          description: string
          fat_g?: number | null
          food_id?: string | null
          id?: string
          logged_at: string
          meal_type: string
          protein_g?: number
          serving_quantity?: number
          source?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          calories?: number
          carbohydrate_g?: number | null
          confidence?: number | null
          created_at?: string
          description?: string
          fat_g?: number | null
          food_id?: string | null
          id?: string
          logged_at?: string
          meal_type?: string
          protein_g?: number
          serving_quantity?: number
          source?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "nutrition_logs_food_id_user_id_fkey"
            columns: ["food_id", "user_id"]
            isOneToOne: false
            referencedRelation: "foods"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      nutrition_targets: {
        Row: {
          accepted_at: string | null
          calories: number
          created_at: string
          effective_from: string
          id: string
          protein_g: number
          source: string
          user_id: string
        }
        Insert: {
          accepted_at?: string | null
          calories: number
          created_at?: string
          effective_from: string
          id?: string
          protein_g: number
          source: string
          user_id: string
        }
        Update: {
          accepted_at?: string | null
          calories?: number
          created_at?: string
          effective_from?: string
          id?: string
          protein_g?: number
          source?: string
          user_id?: string
        }
        Relationships: []
      }
      plan_weeks: {
        Row: {
          created_at: string
          id: string
          starts_on: string
          status: string
          training_plan_id: string
          updated_at: string
          user_id: string
          week_number: number
        }
        Insert: {
          created_at?: string
          id?: string
          starts_on: string
          status?: string
          training_plan_id: string
          updated_at?: string
          user_id: string
          week_number: number
        }
        Update: {
          created_at?: string
          id?: string
          starts_on?: string
          status?: string
          training_plan_id?: string
          updated_at?: string
          user_id?: string
          week_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "plan_weeks_training_plan_id_user_id_fkey"
            columns: ["training_plan_id", "user_id"]
            isOneToOne: false
            referencedRelation: "training_plans"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          date_of_birth: string | null
          display_name: string | null
          height_cm: number | null
          onboarding_completed_at: string | null
          preferred_distance_unit: string
          preferred_weight_unit: string
          sex_for_calculation: string | null
          timezone: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          date_of_birth?: string | null
          display_name?: string | null
          height_cm?: number | null
          onboarding_completed_at?: string | null
          preferred_distance_unit?: string
          preferred_weight_unit?: string
          sex_for_calculation?: string | null
          timezone?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          date_of_birth?: string | null
          display_name?: string | null
          height_cm?: number | null
          onboarding_completed_at?: string | null
          preferred_distance_unit?: string
          preferred_weight_unit?: string
          sex_for_calculation?: string | null
          timezone?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      readiness_checkins: {
        Row: {
          checkin_type: Database["public"]["Enums"]["checkin_type"]
          classification: Database["public"]["Enums"]["readiness_classification"]
          confidence_score: number
          created_at: string
          id: string
          notes: string | null
          pain_score: number
          rule_version: string
          scheduled_session_id: string | null
          stiffness_change: string
          sudden_change: boolean
          swelling_level: string
          trigger_reasons: Json
          user_id: string
          walking_status: string
        }
        Insert: {
          checkin_type: Database["public"]["Enums"]["checkin_type"]
          classification: Database["public"]["Enums"]["readiness_classification"]
          confidence_score: number
          created_at?: string
          id?: string
          notes?: string | null
          pain_score: number
          rule_version: string
          scheduled_session_id?: string | null
          stiffness_change: string
          sudden_change: boolean
          swelling_level: string
          trigger_reasons?: Json
          user_id: string
          walking_status: string
        }
        Update: {
          checkin_type?: Database["public"]["Enums"]["checkin_type"]
          classification?: Database["public"]["Enums"]["readiness_classification"]
          confidence_score?: number
          created_at?: string
          id?: string
          notes?: string | null
          pain_score?: number
          rule_version?: string
          scheduled_session_id?: string | null
          stiffness_change?: string
          sudden_change?: boolean
          swelling_level?: string
          trigger_reasons?: Json
          user_id?: string
          walking_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "readiness_checkins_scheduled_session_id_user_id_fkey"
            columns: ["scheduled_session_id", "user_id"]
            isOneToOne: false
            referencedRelation: "scheduled_sessions"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      scheduled_sessions: {
        Row: {
          created_at: string
          id: string
          plan_week_id: string | null
          replacement_for_id: string | null
          reschedule_reason: string | null
          scheduled_date: string
          session_type: string
          source: string
          status: Database["public"]["Enums"]["session_status"]
          template_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          plan_week_id?: string | null
          replacement_for_id?: string | null
          reschedule_reason?: string | null
          scheduled_date: string
          session_type: string
          source?: string
          status?: Database["public"]["Enums"]["session_status"]
          template_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          plan_week_id?: string | null
          replacement_for_id?: string | null
          reschedule_reason?: string | null
          scheduled_date?: string
          session_type?: string
          source?: string
          status?: Database["public"]["Enums"]["session_status"]
          template_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scheduled_sessions_plan_week_id_user_id_fkey"
            columns: ["plan_week_id", "user_id"]
            isOneToOne: false
            referencedRelation: "plan_weeks"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "scheduled_sessions_replacement_for_id_user_id_fkey"
            columns: ["replacement_for_id", "user_id"]
            isOneToOne: false
            referencedRelation: "scheduled_sessions"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "scheduled_sessions_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "workout_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      set_logs: {
        Row: {
          client_operation_id: string | null
          completed_at: string
          created_at: string
          discomfort_score: number | null
          duration_seconds: number | null
          effort_score: number | null
          exercise_log_id: string
          id: string
          repetitions: number | null
          set_number: number
          user_id: string
          weight_kg: number | null
        }
        Insert: {
          client_operation_id?: string | null
          completed_at?: string
          created_at?: string
          discomfort_score?: number | null
          duration_seconds?: number | null
          effort_score?: number | null
          exercise_log_id: string
          id?: string
          repetitions?: number | null
          set_number: number
          user_id: string
          weight_kg?: number | null
        }
        Update: {
          client_operation_id?: string | null
          completed_at?: string
          created_at?: string
          discomfort_score?: number | null
          duration_seconds?: number | null
          effort_score?: number | null
          exercise_log_id?: string
          id?: string
          repetitions?: number | null
          set_number?: number
          user_id?: string
          weight_kg?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "set_logs_exercise_log_id_user_id_fkey"
            columns: ["exercise_log_id", "user_id"]
            isOneToOne: false
            referencedRelation: "exercise_logs"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      training_plans: {
        Row: {
          created_at: string
          ends_on: string | null
          id: string
          name: string
          starts_on: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          ends_on?: string | null
          id?: string
          name: string
          starts_on: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          ends_on?: string | null
          id?: string
          name?: string
          starts_on?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      weekly_reviews: {
        Row: {
          accepted_changes: Json | null
          created_at: string
          id: string
          metrics: Json
          period_end: string
          period_start: string
          recommendations: Json
          reviewed_at: string | null
          rule_version: string
          user_id: string
        }
        Insert: {
          accepted_changes?: Json | null
          created_at?: string
          id?: string
          metrics: Json
          period_end: string
          period_start: string
          recommendations: Json
          reviewed_at?: string | null
          rule_version: string
          user_id: string
        }
        Update: {
          accepted_changes?: Json | null
          created_at?: string
          id?: string
          metrics?: Json
          period_end?: string
          period_start?: string
          recommendations?: Json
          reviewed_at?: string | null
          rule_version?: string
          user_id?: string
        }
        Relationships: []
      }
      workout_logs: {
        Row: {
          completed_at: string | null
          created_at: string
          id: string
          notes: string | null
          scheduled_session_id: string | null
          session_effort: number | null
          started_at: string
          status: Database["public"]["Enums"]["session_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          scheduled_session_id?: string | null
          session_effort?: number | null
          started_at: string
          status?: Database["public"]["Enums"]["session_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          scheduled_session_id?: string | null
          session_effort?: number | null
          started_at?: string
          status?: Database["public"]["Enums"]["session_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workout_logs_scheduled_session_id_user_id_fkey"
            columns: ["scheduled_session_id", "user_id"]
            isOneToOne: false
            referencedRelation: "scheduled_sessions"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      workout_template_exercises: {
        Row: {
          created_at: string
          exercise_id: string
          exercise_order: number
          id: string
          rep_max: number | null
          rep_min: number | null
          rest_seconds: number | null
          substitution_group: string | null
          target_sets: number
          template_id: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          exercise_id: string
          exercise_order: number
          id?: string
          rep_max?: number | null
          rep_min?: number | null
          rest_seconds?: number | null
          substitution_group?: string | null
          target_sets: number
          template_id: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          exercise_id?: string
          exercise_order?: number
          id?: string
          rep_max?: number | null
          rep_min?: number | null
          rest_seconds?: number | null
          substitution_group?: string | null
          target_sets?: number
          template_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workout_template_exercises_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workout_template_exercises_template_id_user_id_fkey"
            columns: ["template_id", "user_id"]
            isOneToOne: false
            referencedRelation: "workout_templates"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      workout_templates: {
        Row: {
          created_at: string
          estimated_minutes: number | null
          id: string
          is_system: boolean
          name: string
          session_type: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          estimated_minutes?: number | null
          id?: string
          is_system?: boolean
          name: string
          session_type: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          estimated_minutes?: number | null
          id?: string
          is_system?: boolean
          name?: string
          session_type?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      seed_private_plan: {
        Args: { p_reset?: boolean; p_start_date: string }
        Returns: string
      }
    }
    Enums: {
      checkin_type: "pre_session" | "post_session" | "next_morning"
      measurement_type: "weight" | "waist"
      readiness_classification: "green" | "amber" | "red"
      session_status:
        | "planned"
        | "in_progress"
        | "completed"
        | "skipped"
        | "replaced"
        | "cancelled"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      checkin_type: ["pre_session", "post_session", "next_morning"],
      measurement_type: ["weight", "waist"],
      readiness_classification: ["green", "amber", "red"],
      session_status: [
        "planned",
        "in_progress",
        "completed",
        "skipped",
        "replaced",
        "cancelled",
      ],
    },
  },
} as const

