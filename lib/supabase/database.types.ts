export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type Table<Row, Insert> = {
  Insert: Insert;
  Relationships: [];
  Row: Row;
  Update: Partial<Insert>;
};

type Identified = { created_at: string; id: string; user_id: string };
type IdentifiedInsert = { created_at?: string; id?: string; user_id: string };

export type Database = {
  public: {
    CompositeTypes: Record<never, never>;
    Enums: {
      checkin_type: 'pre_session' | 'post_session' | 'next_morning';
      measurement_type: 'weight' | 'waist';
      readiness_classification: 'green' | 'amber' | 'red';
      session_status: 'planned' | 'in_progress' | 'completed' | 'skipped' | 'replaced' | 'cancelled';
    };
    Functions: {
      set_updated_at: { Args: Record<PropertyKey, never>; Returns: unknown };
    };
    Tables: {
      alcohol_logs: Table<
        Identified & {
          abv_percent: number;
          calories: number;
          drink_name: string;
          drink_type: string | null;
          logged_at: string;
          occasion_note: string | null;
          units: number;
          updated_at: string;
          volume_ml: number;
        },
        IdentifiedInsert & {
          abv_percent: number;
          calories: number;
          drink_name: string;
          drink_type?: string | null;
          logged_at: string;
          occasion_note?: string | null;
          units: number;
          updated_at?: string;
          volume_ml: number;
        }
      >;
      audit_events: Table<
        Identified & { details: Json; entity_id: string | null; entity_type: string | null; event_type: string },
        IdentifiedInsert & { details?: Json; entity_id?: string | null; entity_type?: string | null; event_type: string }
      >;
      body_measurements: Table<
        Identified & {
          conditions_note: string | null;
          measured_at: string;
          measurement_type: Database['public']['Enums']['measurement_type'];
          unit: string;
          updated_at: string;
          value: number;
        },
        IdentifiedInsert & {
          conditions_note?: string | null;
          measured_at: string;
          measurement_type: Database['public']['Enums']['measurement_type'];
          unit: string;
          updated_at?: string;
          value: number;
        }
      >;
      exercise_logs: Table<
        Identified & { exercise_id: string; exercise_order: number; workout_log_id: string },
        IdentifiedInsert & { exercise_id: string; exercise_order: number; workout_log_id: string }
      >;
      exercises: Table<
        {
          active: boolean;
          beginner_setup: string | null;
          body_region: string | null;
          category: string;
          common_mistakes: string | null;
          created_at: string;
          equipment: string | null;
          execution_steps: string | null;
          id: string;
          movement_pattern: string | null;
          name: string;
          slug: string;
          stop_criteria: string | null;
          updated_at: string;
        },
        {
          active?: boolean;
          beginner_setup?: string | null;
          body_region?: string | null;
          category: string;
          common_mistakes?: string | null;
          created_at?: string;
          equipment?: string | null;
          execution_steps?: string | null;
          id?: string;
          movement_pattern?: string | null;
          name: string;
          slug: string;
          stop_criteria?: string | null;
          updated_at?: string;
        }
      >;
      foods: Table<
        Identified & {
          calories: number;
          carbohydrate_g: number | null;
          fat_g: number | null;
          favourite: boolean;
          name: string;
          protein_g: number;
          serving_description: string | null;
          updated_at: string;
        },
        IdentifiedInsert & {
          calories: number;
          carbohydrate_g?: number | null;
          fat_g?: number | null;
          favourite?: boolean;
          name: string;
          protein_g?: number;
          serving_description?: string | null;
          updated_at?: string;
        }
      >;
      goals: Table<
        Identified & {
          goal_type: string;
          is_active: boolean;
          start_value: number | null;
          target_date: string | null;
          target_value: number | null;
          updated_at: string;
        },
        IdentifiedInsert & {
          goal_type: string;
          is_active?: boolean;
          start_value?: number | null;
          target_date?: string | null;
          target_value?: number | null;
          updated_at?: string;
        }
      >;
      health_context: Table<
        Identified & {
          active: boolean;
          body_area: string | null;
          context_type: string;
          description: string | null;
          professional_restrictions: string | null;
          updated_at: string;
        },
        IdentifiedInsert & {
          active?: boolean;
          body_area?: string | null;
          context_type: string;
          description?: string | null;
          professional_restrictions?: string | null;
          updated_at?: string;
        }
      >;
      nutrition_logs: Table<
        Identified & {
          calories: number;
          carbohydrate_g: number | null;
          confidence: number | null;
          description: string;
          fat_g: number | null;
          food_id: string | null;
          logged_at: string;
          meal_type: string;
          protein_g: number;
          serving_quantity: number;
          source: string;
          updated_at: string;
        },
        IdentifiedInsert & {
          calories: number;
          carbohydrate_g?: number | null;
          confidence?: number | null;
          description: string;
          fat_g?: number | null;
          food_id?: string | null;
          logged_at: string;
          meal_type: string;
          protein_g?: number;
          serving_quantity?: number;
          source?: string;
          updated_at?: string;
        }
      >;
      nutrition_targets: Table<
        Identified & {
          accepted_at: string | null;
          calories: number;
          effective_from: string;
          protein_g: number;
          source: string;
        },
        IdentifiedInsert & {
          accepted_at?: string | null;
          calories: number;
          effective_from: string;
          protein_g: number;
          source: string;
        }
      >;
      plan_weeks: Table<
        Identified & {
          starts_on: string;
          status: string;
          training_plan_id: string;
          updated_at: string;
          week_number: number;
        },
        IdentifiedInsert & {
          starts_on: string;
          status?: string;
          training_plan_id: string;
          updated_at?: string;
          week_number: number;
        }
      >;
      profiles: Table<
        {
          created_at: string;
          date_of_birth: string | null;
          display_name: string | null;
          height_cm: number | null;
          onboarding_completed_at: string | null;
          preferred_distance_unit: string;
          preferred_weight_unit: string;
          sex_for_calculation: string | null;
          timezone: string;
          updated_at: string;
          user_id: string;
        },
        {
          created_at?: string;
          date_of_birth?: string | null;
          display_name?: string | null;
          height_cm?: number | null;
          onboarding_completed_at?: string | null;
          preferred_distance_unit?: string;
          preferred_weight_unit?: string;
          sex_for_calculation?: string | null;
          timezone?: string;
          updated_at?: string;
          user_id: string;
        }
      >;
      readiness_checkins: Table<
        Identified & {
          checkin_type: Database['public']['Enums']['checkin_type'];
          classification: Database['public']['Enums']['readiness_classification'];
          confidence_score: number;
          notes: string | null;
          pain_score: number;
          rule_version: string;
          scheduled_session_id: string | null;
          stiffness_change: string;
          sudden_change: boolean;
          swelling_level: string;
          trigger_reasons: Json;
          walking_status: string;
        },
        IdentifiedInsert & {
          checkin_type: Database['public']['Enums']['checkin_type'];
          classification: Database['public']['Enums']['readiness_classification'];
          confidence_score: number;
          notes?: string | null;
          pain_score: number;
          rule_version: string;
          scheduled_session_id?: string | null;
          stiffness_change: string;
          sudden_change: boolean;
          swelling_level: string;
          trigger_reasons?: Json;
          walking_status: string;
        }
      >;
      scheduled_sessions: Table<
        Identified & {
          plan_week_id: string | null;
          replacement_for_id: string | null;
          reschedule_reason: string | null;
          scheduled_date: string;
          session_type: string;
          source: string;
          status: Database['public']['Enums']['session_status'];
          template_id: string | null;
          updated_at: string;
        },
        IdentifiedInsert & {
          plan_week_id?: string | null;
          replacement_for_id?: string | null;
          reschedule_reason?: string | null;
          scheduled_date: string;
          session_type: string;
          source?: string;
          status?: Database['public']['Enums']['session_status'];
          template_id?: string | null;
          updated_at?: string;
        }
      >;
      set_logs: Table<
        Identified & {
          client_operation_id: string | null;
          completed_at: string;
          discomfort_score: number | null;
          duration_seconds: number | null;
          effort_score: number | null;
          exercise_log_id: string;
          repetitions: number | null;
          set_number: number;
          weight_kg: number | null;
        },
        IdentifiedInsert & {
          client_operation_id?: string | null;
          completed_at?: string;
          discomfort_score?: number | null;
          duration_seconds?: number | null;
          effort_score?: number | null;
          exercise_log_id: string;
          repetitions?: number | null;
          set_number: number;
          weight_kg?: number | null;
        }
      >;
      training_plans: Table<
        Identified & {
          ends_on: string | null;
          name: string;
          starts_on: string;
          status: string;
          updated_at: string;
        },
        IdentifiedInsert & {
          ends_on?: string | null;
          name: string;
          starts_on: string;
          status?: string;
          updated_at?: string;
        }
      >;
      weekly_reviews: Table<
        Identified & {
          accepted_changes: Json | null;
          metrics: Json;
          period_end: string;
          period_start: string;
          recommendations: Json;
          reviewed_at: string | null;
          rule_version: string;
        },
        IdentifiedInsert & {
          accepted_changes?: Json | null;
          metrics: Json;
          period_end: string;
          period_start: string;
          recommendations: Json;
          reviewed_at?: string | null;
          rule_version: string;
        }
      >;
      workout_logs: Table<
        Identified & {
          completed_at: string | null;
          notes: string | null;
          scheduled_session_id: string | null;
          session_effort: number | null;
          started_at: string;
          status: Database['public']['Enums']['session_status'];
          updated_at: string;
        },
        IdentifiedInsert & {
          completed_at?: string | null;
          notes?: string | null;
          scheduled_session_id?: string | null;
          session_effort?: number | null;
          started_at: string;
          status?: Database['public']['Enums']['session_status'];
          updated_at?: string;
        }
      >;
      workout_template_exercises: Table<
        {
          created_at: string;
          exercise_id: string;
          exercise_order: number;
          id: string;
          rep_max: number | null;
          rep_min: number | null;
          rest_seconds: number | null;
          substitution_group: string | null;
          target_sets: number;
          template_id: string;
          user_id: string | null;
        },
        {
          created_at?: string;
          exercise_id: string;
          exercise_order: number;
          id?: string;
          rep_max?: number | null;
          rep_min?: number | null;
          rest_seconds?: number | null;
          substitution_group?: string | null;
          target_sets: number;
          template_id: string;
          user_id?: string | null;
        }
      >;
      workout_templates: Table<
        {
          created_at: string;
          estimated_minutes: number | null;
          id: string;
          is_system: boolean;
          name: string;
          session_type: string;
          updated_at: string;
          user_id: string | null;
        },
        {
          created_at?: string;
          estimated_minutes?: number | null;
          id?: string;
          is_system?: boolean;
          name: string;
          session_type: string;
          updated_at?: string;
          user_id?: string | null;
        }
      >;
    };
    Views: Record<never, never>;
  };
};

type PublicSchema = Database[Extract<keyof Database, 'public'>];

export type Tables<
  PublicTableNameOrOptions extends keyof (PublicSchema['Tables'] & PublicSchema['Views']) | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof (Database[PublicTableNameOrOptions['schema']]['Tables'] &
        Database[PublicTableNameOrOptions['schema']]['Views'])
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? (Database[PublicTableNameOrOptions['schema']]['Tables'] &
      Database[PublicTableNameOrOptions['schema']]['Views'])[TableName] extends { Row: infer Row }
    ? Row
    : never
  : PublicTableNameOrOptions extends keyof (PublicSchema['Tables'] & PublicSchema['Views'])
    ? (PublicSchema['Tables'] & PublicSchema['Views'])[PublicTableNameOrOptions] extends { Row: infer Row }
      ? Row
      : never
    : never;

export type TablesInsert<PublicTableName extends keyof PublicSchema['Tables']> =
  PublicSchema['Tables'][PublicTableName] extends { Insert: infer Insert } ? Insert : never;

export type TablesUpdate<PublicTableName extends keyof PublicSchema['Tables']> =
  PublicSchema['Tables'][PublicTableName] extends { Update: infer Update } ? Update : never;

export type Enums<PublicEnumName extends keyof PublicSchema['Enums']> = PublicSchema['Enums'][PublicEnumName];
