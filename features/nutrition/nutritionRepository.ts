// Server boundary for nutrition logging (roadmap 19, docs/03 S-031/S-032, docs/05 §5.7).
// Mirrors features/measurements and features/today: a narrow backend interface keeps the
// composition testable, and a Supabase adapter implements it against the RLS-protected,
// owner-scoped nutrition_targets, foods, nutrition_logs and meal_templates tables. Every
// read only ever sees the caller's own rows because RLS enforces auth.uid() = user_id.
//
// This is a PLAIN owner-scoped logging feature. Nutrition has no safety rule a client
// could violate by logging (unlike readiness's trusted classifier or the red
// session-start block), so a direct owner-scoped INSERT under RLS is exactly right —
// there is no trusted RPC and none is needed. Zod validation (nutritionSchema.ts) is the
// boundary that keeps malformed numbers out.
//
// Effective-dated targets keep HISTORY rather than overwriting (docs/05 §5.7): a new
// target is a NEW row with a later effective_from, and "the current target" is resolved
// (resolveCurrentNutritionTarget) as the latest effective_from on or before today. The
// §6.7 calorie-adjustment engine (roadmap 22) will READ these targets and logs; it is not
// built here.

import type { SupabaseClient } from '@supabase/supabase-js';

import {
  type DiaryEntry,
  type DiarySummary,
  isMealType,
  type MealType,
  type Macros,
  scaleMacros,
  summariseDiary,
} from '@/domain/nutrition/nutritionDiary';
import {
  computeNutrientProgress,
  type NutrientProgress,
  type NutritionTarget,
  resolveCurrentNutritionTarget,
} from '@/domain/nutrition/nutritionTargets';
import type { Database } from '@/lib/supabase';

type BackendError = { message: string } | null;

// A Postgres unique-violation, used to detect a second target on the same effective date.
const UNIQUE_VIOLATION = '23505';

// ---- Raw rows and camelCase records ----------------------------------------

type RawTarget = {
  id: string;
  effective_from: string;
  calories: number;
  protein_g: number;
  source: string;
  created_at: string;
};
type RawFood = {
  id: string;
  name: string;
  serving_description: string | null;
  calories: number;
  protein_g: number;
  carbohydrate_g: number | null;
  fat_g: number | null;
  favourite: boolean;
};
type RawLog = {
  id: string;
  logged_at: string;
  meal_type: string;
  description: string;
  calories: number;
  protein_g: number;
  food_id: string | null;
};
type RawTemplate = { id: string; name: string; created_at: string };
type RawTemplateItem = {
  id: string;
  meal_template_id: string;
  food_id: string | null;
  description: string;
  serving_quantity: number;
  calories: number;
  protein_g: number;
  carbohydrate_g: number | null;
  fat_g: number | null;
};

export type TargetRecord = {
  id: string;
  effectiveFrom: string;
  calories: number;
  proteinG: number;
  source: string;
};
export type FoodRecord = {
  id: string;
  name: string;
  servingDescription: string | null;
  calories: number;
  proteinG: number;
  carbohydrateG: number | null;
  fatG: number | null;
  favourite: boolean;
};
export type RecentFood = {
  description: string;
  foodId: string | null;
  calories: number;
  proteinG: number;
};
export type MealTemplateSummary = {
  id: string;
  name: string;
  itemCount: number;
  calories: number;
  proteinG: number;
};

// ---- Insert inputs ---------------------------------------------------------

export type TargetInsert = {
  userId: string;
  calories: number;
  proteinG: number;
  effectiveFromIso: string;
  source: string;
};
export type FoodInsert = {
  userId: string;
  name: string;
  servingDescription: string | null;
  calories: number;
  proteinG: number;
  carbohydrateG: number | null;
  fatG: number | null;
  favourite: boolean;
};
export type LogInsert = {
  userId: string;
  loggedAtIso: string;
  mealType: MealType;
  description: string;
  foodId: string | null;
  servingQuantity: number;
  calories: number;
  proteinG: number;
  carbohydrateG: number | null;
  fatG: number | null;
  source: string;
};

export type NutritionBackend = {
  fetchTargets(): Promise<{ data: RawTarget[] | null; error: BackendError }>;
  insertTarget(
    input: TargetInsert,
  ): Promise<{ data: { id: string } | null; error: BackendError }>;
  fetchFoods(): Promise<{ data: RawFood[] | null; error: BackendError }>;
  insertFood(
    input: FoodInsert,
  ): Promise<{ data: { id: string } | null; error: BackendError }>;
  fetchDayLogs(
    startIso: string,
    endIso: string,
  ): Promise<{ data: RawLog[] | null; error: BackendError }>;
  fetchRecentLogs(
    limit: number,
  ): Promise<{ data: RawLog[] | null; error: BackendError }>;
  insertLogs(
    rows: LogInsert[],
  ): Promise<{ data: { id: string }[] | null; error: BackendError }>;
  fetchTemplates(): Promise<{
    data: RawTemplate[] | null;
    error: BackendError;
  }>;
  fetchTemplateItems(
    templateId?: string,
  ): Promise<{ data: RawTemplateItem[] | null; error: BackendError }>;
  insertTemplate(input: {
    userId: string;
    name: string;
  }): Promise<{ data: { id: string } | null; error: BackendError }>;
  insertTemplateItems(
    rows: {
      userId: string;
      mealTemplateId: string;
      foodId: string | null;
      description: string;
      servingQuantity: number;
      calories: number;
      proteinG: number;
      carbohydrateG: number | null;
      fatG: number | null;
    }[],
  ): Promise<{ error: BackendError }>;
  deleteTemplate(templateId: string): Promise<{ error: BackendError }>;
};

// ---- Result shapes ---------------------------------------------------------

export type SaveResult =
  | { status: 'saved'; id: string }
  // Offline: the write is server-side, so it fails honestly rather than pretending it
  // saved. Nothing is held locally — the user retries when back online (a fuller offline
  // queue is a noted seam, not needed for a plain log).
  | { status: 'offline' }
  | { status: 'error'; message: string };

export type LoadTargetsResult =
  | {
      status: 'ready';
      data: { current: NutritionTarget | null; history: TargetRecord[] };
    }
  | { status: 'error'; message: string };

export type FoodOptions = {
  all: FoodRecord[];
  favourites: FoodRecord[];
  recent: RecentFood[];
};
export type LoadFoodsResult =
  { status: 'ready'; data: FoodOptions } | { status: 'error'; message: string };

export type DiaryReadModel = {
  summary: DiarySummary;
  target: NutritionTarget | null;
  // Progress of the day's totals against the current target. Null when no target is set,
  // so the diary shows totals alone rather than a meaningless "remaining" (docs/03 S-031).
  caloriesProgress: NutrientProgress | null;
  proteinProgress: NutrientProgress | null;
};
export type LoadDiaryResult =
  | { status: 'ready'; data: DiaryReadModel }
  | { status: 'error'; message: string };

export type LoadTemplatesResult =
  | { status: 'ready'; data: MealTemplateSummary[] }
  | { status: 'error'; message: string };

const SAVE_ERROR =
  'We could not save that. Check your connection and try again.';
const READ_ERROR =
  'We could not load your nutrition. Check your connection and try again.';
const DUPLICATE_TARGET =
  'A target already starts on that date. Choose a different start date.';

function looksOffline(error: { message?: string } | null): boolean {
  const message = (error?.message ?? '').toLowerCase();
  return (
    message.includes('network') ||
    message.includes('fetch') ||
    message.includes('failed to fetch') ||
    message.includes('offline') ||
    message.includes('timeout')
  );
}

// A UTC day window [start, end] for a plain YYYY-MM-DD date. Nutrition intake is read
// per calendar day; a full timezone story is a noted seam (single-user MVP).
export function dayWindow(dayIso: string): {
  startIso: string;
  endIso: string;
} {
  return {
    endIso: `${dayIso}T23:59:59.999Z`,
    startIso: `${dayIso}T00:00:00.000Z`,
  };
}

// ---- Supabase adapter ------------------------------------------------------

export function createSupabaseNutritionBackend(
  client: SupabaseClient<Database>,
): NutritionBackend {
  return {
    async fetchTargets() {
      const { data, error } = await client
        .from('nutrition_targets')
        .select('id, effective_from, calories, protein_g, source, created_at')
        .order('effective_from', { ascending: false });
      return { data: data as RawTarget[] | null, error };
    },
    async insertTarget(input) {
      const { data, error } = await client
        .from('nutrition_targets')
        .insert({
          calories: input.calories,
          effective_from: input.effectiveFromIso,
          protein_g: input.proteinG,
          source: input.source,
          user_id: input.userId,
        })
        .select('id')
        .single();
      return { data: data ? { id: data.id } : null, error };
    },
    async fetchFoods() {
      const { data, error } = await client
        .from('foods')
        .select(
          'id, name, serving_description, calories, protein_g, carbohydrate_g, fat_g, favourite',
        )
        .order('name', { ascending: true });
      return { data: data as RawFood[] | null, error };
    },
    async insertFood(input) {
      const { data, error } = await client
        .from('foods')
        .insert({
          calories: input.calories,
          carbohydrate_g: input.carbohydrateG,
          fat_g: input.fatG,
          favourite: input.favourite,
          name: input.name,
          protein_g: input.proteinG,
          serving_description: input.servingDescription,
          user_id: input.userId,
        })
        .select('id')
        .single();
      return { data: data ? { id: data.id } : null, error };
    },
    async fetchDayLogs(startIso, endIso) {
      const { data, error } = await client
        .from('nutrition_logs')
        .select(
          'id, logged_at, meal_type, description, calories, protein_g, food_id',
        )
        .gte('logged_at', startIso)
        .lte('logged_at', endIso)
        .order('logged_at', { ascending: true });
      return { data: data as RawLog[] | null, error };
    },
    async fetchRecentLogs(limit) {
      const { data, error } = await client
        .from('nutrition_logs')
        .select(
          'id, logged_at, meal_type, description, calories, protein_g, food_id',
        )
        .order('logged_at', { ascending: false })
        .limit(limit);
      return { data: data as RawLog[] | null, error };
    },
    async insertLogs(rows) {
      const { data, error } = await client
        .from('nutrition_logs')
        .insert(
          rows.map((row) => ({
            calories: row.calories,
            carbohydrate_g: row.carbohydrateG,
            description: row.description,
            fat_g: row.fatG,
            food_id: row.foodId,
            logged_at: row.loggedAtIso,
            meal_type: row.mealType,
            protein_g: row.proteinG,
            serving_quantity: row.servingQuantity,
            source: row.source,
            user_id: row.userId,
          })),
        )
        .select('id');
      return { data: data as { id: string }[] | null, error };
    },
    async fetchTemplates() {
      const { data, error } = await client
        .from('meal_templates')
        .select('id, name, created_at')
        .order('created_at', { ascending: false });
      return { data: data as RawTemplate[] | null, error };
    },
    async fetchTemplateItems(templateId) {
      let query = client
        .from('meal_template_items')
        .select(
          'id, meal_template_id, food_id, description, serving_quantity, calories, protein_g, carbohydrate_g, fat_g',
        );
      if (templateId) {
        query = query.eq('meal_template_id', templateId);
      }
      const { data, error } = await query;
      return { data: data as RawTemplateItem[] | null, error };
    },
    async insertTemplate(input) {
      const { data, error } = await client
        .from('meal_templates')
        .insert({ name: input.name, user_id: input.userId })
        .select('id')
        .single();
      return { data: data ? { id: data.id } : null, error };
    },
    async insertTemplateItems(rows) {
      const { error } = await client.from('meal_template_items').insert(
        rows.map((row) => ({
          calories: row.calories,
          carbohydrate_g: row.carbohydrateG,
          description: row.description,
          fat_g: row.fatG,
          food_id: row.foodId,
          meal_template_id: row.mealTemplateId,
          protein_g: row.proteinG,
          serving_quantity: row.servingQuantity,
          user_id: row.userId,
        })),
      );
      return { error };
    },
    async deleteTemplate(templateId) {
      const { error } = await client
        .from('meal_templates')
        .delete()
        .eq('id', templateId);
      return { error };
    },
  };
}

// ---- Mapping helpers -------------------------------------------------------

function toTargetRecord(raw: RawTarget): TargetRecord {
  return {
    calories: raw.calories,
    effectiveFrom: raw.effective_from,
    id: raw.id,
    proteinG: raw.protein_g,
    source: raw.source,
  };
}
function toFoodRecord(raw: RawFood): FoodRecord {
  return {
    calories: raw.calories,
    carbohydrateG: raw.carbohydrate_g,
    fatG: raw.fat_g,
    favourite: raw.favourite,
    id: raw.id,
    name: raw.name,
    proteinG: raw.protein_g,
    servingDescription: raw.serving_description,
  };
}

// Convert a raw log into a diary entry, dropping any with an unrecognised meal_type
// (defensive against bad data — an entry is never silently miscounted under a valid meal).
function toDiaryEntry(raw: RawLog): DiaryEntry | null {
  if (!isMealType(raw.meal_type)) {
    return null;
  }
  return {
    calories: raw.calories,
    description: raw.description,
    id: raw.id,
    mealType: raw.meal_type,
    proteinG: raw.protein_g,
  };
}

// The per-serving macros a template item promised (its stored snapshot), for expansion.
function itemMacros(item: RawTemplateItem): Macros {
  return {
    calories: item.calories,
    carbohydrateG: item.carbohydrate_g,
    fatG: item.fat_g,
    proteinG: item.protein_g,
  };
}

// ---- Composed repository ---------------------------------------------------

export function createNutritionRepository(backend: NutritionBackend) {
  return {
    // Targets ---------------------------------------------------------------
    async loadTargets(todayIso: string): Promise<LoadTargetsResult> {
      const { data, error } = await backend.fetchTargets();
      if (error) {
        return { message: READ_ERROR, status: 'error' };
      }
      const history = (data ?? []).map(toTargetRecord);
      const current = resolveCurrentNutritionTarget(
        history.map((row) => ({
          calories: row.calories,
          effectiveFrom: row.effectiveFrom,
          proteinG: row.proteinG,
        })),
        todayIso,
      );
      return { data: { current, history }, status: 'ready' };
    },

    // Insert a NEW effective-dated target row — never edits an old one, so history is
    // preserved. A same-date collision (unique(user_id, effective_from)) is a clean,
    // named error, not a crash.
    async setTarget(input: TargetInsert): Promise<SaveResult> {
      const { data, error } = await backend.insertTarget(input);
      if (error) {
        if (looksOffline(error)) {
          return { status: 'offline' };
        }
        const code = (error as { code?: string }).code;
        if (
          code === UNIQUE_VIOLATION ||
          error.message.includes(UNIQUE_VIOLATION)
        ) {
          return { message: DUPLICATE_TARGET, status: 'error' };
        }
        return { message: error.message || SAVE_ERROR, status: 'error' };
      }
      if (!data) {
        return { message: SAVE_ERROR, status: 'error' };
      }
      return { id: data.id, status: 'saved' };
    },

    // Foods -----------------------------------------------------------------
    async loadFoodOptions(recentLimit = 8): Promise<LoadFoodsResult> {
      const foodsResult = await backend.fetchFoods();
      if (foodsResult.error) {
        return { message: READ_ERROR, status: 'error' };
      }
      const all = (foodsResult.data ?? []).map(toFoodRecord);
      const favourites = all.filter((food) => food.favourite);

      // Recent foods are derived from the log, most-recently-logged first, de-duplicated
      // by the food (or by description for quick entries), so the same food does not
      // repeat down the list (docs/03 S-031 "Recent entries appear below").
      const recentResult = await backend.fetchRecentLogs(recentLimit * 4);
      const recent: RecentFood[] = [];
      const seen = new Set<string>();
      for (const raw of recentResult.data ?? []) {
        const key = raw.food_id ?? `desc:${raw.description.toLowerCase()}`;
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);
        recent.push({
          calories: raw.calories,
          description: raw.description,
          foodId: raw.food_id,
          proteinG: raw.protein_g,
        });
        if (recent.length >= recentLimit) {
          break;
        }
      }
      return { data: { all, favourites, recent }, status: 'ready' };
    },

    async saveFood(input: FoodInsert): Promise<SaveResult> {
      const { data, error } = await backend.insertFood(input);
      if (error) {
        return looksOffline(error)
          ? { status: 'offline' }
          : { message: error.message || SAVE_ERROR, status: 'error' };
      }
      return data
        ? { id: data.id, status: 'saved' }
        : { message: SAVE_ERROR, status: 'error' };
    },

    // Diary -----------------------------------------------------------------
    async loadDiary(dayIso: string): Promise<LoadDiaryResult> {
      const { endIso, startIso } = dayWindow(dayIso);
      const logsResult = await backend.fetchDayLogs(startIso, endIso);
      if (logsResult.error) {
        return { message: READ_ERROR, status: 'error' };
      }
      const entries = (logsResult.data ?? [])
        .map(toDiaryEntry)
        .filter((entry): entry is DiaryEntry => entry !== null);
      const summary = summariseDiary(entries);

      const targetsResult = await backend.fetchTargets();
      if (targetsResult.error) {
        return { message: READ_ERROR, status: 'error' };
      }
      const target = resolveCurrentNutritionTarget(
        (targetsResult.data ?? []).map((raw) => ({
          calories: raw.calories,
          effectiveFrom: raw.effective_from,
          proteinG: raw.protein_g,
        })),
        dayIso,
      );

      return {
        data: {
          caloriesProgress: target
            ? computeNutrientProgress(target.calories, summary.totals.calories)
            : null,
          proteinProgress: target
            ? computeNutrientProgress(target.proteinG, summary.totals.proteinG)
            : null,
          summary,
          target,
        },
        status: 'ready',
      };
    },

    // Log one entry (a quick entry, or a saved food already scaled by the caller). The
    // caller supplies the FINAL consumed macros; the repository just inserts.
    async logEntry(input: LogInsert): Promise<SaveResult> {
      const { data, error } = await backend.insertLogs([input]);
      if (error) {
        return looksOffline(error)
          ? { status: 'offline' }
          : { message: error.message || SAVE_ERROR, status: 'error' };
      }
      const id = data?.[0]?.id;
      return id
        ? { id, status: 'saved' }
        : { message: SAVE_ERROR, status: 'error' };
    },

    // Log a whole saved meal at once: fetch the template's items and EXPAND each into a
    // nutrition_logs row (scaling its snapshot by its serving quantity), then batch
    // insert them under one meal and time (docs/05 §5.7).
    async logMealTemplate(input: {
      userId: string;
      templateId: string;
      mealType: MealType;
      loggedAtIso: string;
    }): Promise<SaveResult> {
      const itemsResult = await backend.fetchTemplateItems(input.templateId);
      if (itemsResult.error) {
        return looksOffline(itemsResult.error)
          ? { status: 'offline' }
          : { message: READ_ERROR, status: 'error' };
      }
      const items = itemsResult.data ?? [];
      if (items.length === 0) {
        return {
          message: 'This saved meal has no items to log.',
          status: 'error',
        };
      }
      const rows: LogInsert[] = items.map((item) => {
        const scaled = scaleMacros(itemMacros(item), item.serving_quantity);
        return {
          calories: scaled.calories,
          carbohydrateG: scaled.carbohydrateG ?? null,
          description: item.description,
          fatG: scaled.fatG ?? null,
          foodId: item.food_id,
          loggedAtIso: input.loggedAtIso,
          mealType: input.mealType,
          proteinG: scaled.proteinG,
          servingQuantity: item.serving_quantity,
          source: 'template',
          userId: input.userId,
        };
      });
      const { data, error } = await backend.insertLogs(rows);
      if (error) {
        return looksOffline(error)
          ? { status: 'offline' }
          : { message: error.message || SAVE_ERROR, status: 'error' };
      }
      const id = data?.[0]?.id;
      return id
        ? { id, status: 'saved' }
        : { message: SAVE_ERROR, status: 'error' };
    },

    // Meal templates --------------------------------------------------------
    async loadTemplates(): Promise<LoadTemplatesResult> {
      const templatesResult = await backend.fetchTemplates();
      if (templatesResult.error) {
        return { message: READ_ERROR, status: 'error' };
      }
      const templates = templatesResult.data ?? [];
      if (templates.length === 0) {
        return { data: [], status: 'ready' };
      }
      const itemsResult = await backend.fetchTemplateItems();
      if (itemsResult.error) {
        return { message: READ_ERROR, status: 'error' };
      }
      const items = itemsResult.data ?? [];
      const summaries: MealTemplateSummary[] = templates.map((template) => {
        const own = items.filter(
          (item) => item.meal_template_id === template.id,
        );
        let calories = 0;
        let proteinG = 0;
        for (const item of own) {
          const scaled = scaleMacros(itemMacros(item), item.serving_quantity);
          calories += scaled.calories;
          proteinG += scaled.proteinG;
        }
        return {
          calories,
          id: template.id,
          itemCount: own.length,
          name: template.name,
          proteinG: Math.round(proteinG * 100) / 100,
        };
      });
      return { data: summaries, status: 'ready' };
    },

    // Create a saved meal: insert the parent, then its items. If the items fail, delete
    // the parent so no empty, half-created template is left behind (a best-effort
    // rollback in place of a client-side transaction; the RPC route is unnecessary here).
    async saveTemplate(input: {
      userId: string;
      name: string;
      items: {
        foodId: string | null;
        description: string;
        servingQuantity: number;
        calories: number;
        proteinG: number;
        carbohydrateG: number | null;
        fatG: number | null;
      }[];
    }): Promise<SaveResult> {
      const parent = await backend.insertTemplate({
        name: input.name,
        userId: input.userId,
      });
      if (parent.error || !parent.data) {
        if (parent.error && looksOffline(parent.error)) {
          return { status: 'offline' };
        }
        return {
          message: parent.error?.message || SAVE_ERROR,
          status: 'error',
        };
      }
      const templateId = parent.data.id;
      const { error } = await backend.insertTemplateItems(
        input.items.map((item) => ({
          calories: item.calories,
          carbohydrateG: item.carbohydrateG,
          description: item.description,
          fatG: item.fatG,
          foodId: item.foodId,
          mealTemplateId: templateId,
          proteinG: item.proteinG,
          servingQuantity: item.servingQuantity,
          userId: input.userId,
        })),
      );
      if (error) {
        await backend.deleteTemplate(templateId);
        return looksOffline(error)
          ? { status: 'offline' }
          : { message: error.message || SAVE_ERROR, status: 'error' };
      }
      return { id: templateId, status: 'saved' };
    },
  };
}

export type NutritionRepository = ReturnType<typeof createNutritionRepository>;
