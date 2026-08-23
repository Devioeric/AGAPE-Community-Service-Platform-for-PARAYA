// Household Profile Field Catalog
//
// Canonical schema for PARAYA's Family Profiling Form. Each field stores its
// value at household_profiles.extended_data[<code>]. Keeping this in TypeScript
// (not a DB table) means the Researcher can evolve the form by editing this
// file alone — no migrations required.
//
// Aggregations on the community-profile page should reference fields by their
// `code` so a renamed label never breaks a downstream chart.

export type FieldType =
  | "single"      // one-of-many radio / single select
  | "multi"       // many-of-many checkboxes — value is string[]
  | "number"      // integer or decimal
  | "text"        // short free text
  | "longtext"    // paragraph free text
  | "yesno";      // boolean expressed as 'yes' | 'no'

export interface FieldDef {
  code:        string;        // stable identifier — never rename
  label:       string;        // human label shown in the form
  type:        FieldType;
  options?:    string[];      // for single / multi
  help?:       string;        // short clarifier under the label
  required?:   boolean;
}

export interface FieldSection {
  key:    string;
  title:  string;
  fields: FieldDef[];
}

// ─── Sections ──────────────────────────────────────────────────────────────────
// Mirrors the Sitio Bihunan profiling form. Add / reorder freely; the form
// renders sections in order.

export const PROFILE_SECTIONS: FieldSection[] = [
  // ── Demographics ─────────────────────────────────────────────────────────────
  {
    key: "demographics",
    title: "Demographics",
    fields: [
      { code: "respondent_age", label: "Respondent age",   type: "number" },
      { code: "respondent_sex", label: "Respondent sex",   type: "single", options: ["Male", "Female", "Prefer not to say"] },
      { code: "civil_status",   label: "Civil status",     type: "single", options: ["Single", "Married", "Live-in", "Separated", "Widowed", "Not specified"] },
      { code: "is_indigenous",  label: "Indigenous people?",       type: "yesno" },
      { code: "is_migrant",     label: "Has migrant / overseas worker?", type: "yesno" },
    ],
  },

  // ── Socio-economic ────────────────────────────────────────────────────────────
  {
    key: "socioeconomic",
    title: "Socio-economic",
    fields: [
      {
        code: "monthly_income",
        label: "Monthly household income",
        type: "single",
        options: [
          "Below ₱5,000",
          "₱5,000 – ₱9,999",
          "₱10,000 – ₱19,999",
          "₱20,000 – ₱39,999",
          "₱40,000 – ₱59,999",
          "₱60,000 and above",
        ],
      },
      {
        code: "income_sources",
        label: "Income sources",
        type: "multi",
        options: [
          "Salaried employment / wage earner",
          "Daily labor / casual work",
          "Self-employment / small business",
          "Pension / retirement",
          "Remittances / overseas",
          "Government assistance",
          "Other",
        ],
      },
      { code: "income_sufficient", label: "Income sufficient for monthly needs?", type: "yesno" },
      {
        code: "gov_assistance",
        label: "Government assistance received",
        type: "multi",
        options: ["4Ps", "SAP", "Local relief aid", "Senior citizen pension", "PWD pension", "None"],
      },
    ],
  },

  // ── Housing & Utilities ────────────────────────────────────────────────────────
  {
    key: "housing",
    title: "Housing & Utilities",
    fields: [
      {
        code: "housing_tenure",
        label: "Housing tenure",
        type: "single",
        options: [
          "Owned (fully paid)",
          "Owned (with mortgage)",
          "Rented",
          "Informal settler",
          "Living with relatives",
          "Other",
        ],
      },
      { code: "has_electricity", label: "Has electricity?", type: "yesno" },
      { code: "has_internet",    label: "Has internet?",    type: "yesno" },
      {
        code: "water_source",
        label: "Source of water",
        type: "single",
        options: ["NAWASA", "Piped", "Delivered", "Well", "Other"],
      },
      {
        code: "toilet_facility",
        label: "Toilet facility",
        type: "single",
        options: ["Flush toilet", "Manual flush", "Shared toilet", "Pit latrine", "No facility"],
      },
      {
        code: "waste_disposal",
        label: "Waste disposal",
        type: "single",
        options: ["Municipal service", "Burned", "Open dumping", "Compost pit", "Other"],
      },
      {
        code: "gardening",
        label: "Household gardening",
        type: "multi",
        options: ["Vegetables", "Fruit-bearing", "Herbal", "House plants", "Community garden", "None"],
      },
    ],
  },

  // ── Environmental risk ────────────────────────────────────────────────────────
  {
    key: "environment",
    title: "Environmental risk",
    fields: [
      { code: "flood_prone", label: "Flood-prone household?", type: "yesno" },
      {
        code: "flood_monitoring",
        label: "How do you stay informed of floods?",
        type: "multi",
        options: ["SMS / social media", "Public address system", "Word of mouth", "Not monitoring"],
      },
    ],
  },

  // ── Mobility, devices, safety ─────────────────────────────────────────────────
  {
    key: "infrastructure",
    title: "Mobility, devices & safety",
    fields: [
      {
        code: "primary_transport",
        label: "Primary mode of transportation",
        type: "single",
        options: ["Motorcycle", "Public transit", "Tricycle", "Walking", "Bicycle", "Car", "Other"],
      },
      {
        code: "devices",
        label: "Devices in the household",
        type: "multi",
        options: ["Smartphone", "Television", "Desktop computer", "Laptop", "Tablet / iPad", "Smart speaker", "None"],
      },
      { code: "has_cctv", label: "Has CCTV installed?", type: "yesno" },
    ],
  },

  // ── Health & Nutrition ────────────────────────────────────────────────────────
  {
    key: "health",
    title: "Health & Nutrition",
    fields: [
      {
        code: "meals_per_day",
        label: "Meals per day",
        type: "single",
        options: ["1", "2", "3", "4", "5 or more"],
      },
      { code: "monthly_food_budget", label: "Monthly food budget (₱)", type: "number" },
      {
        code: "common_foods",
        label: "Common foods at home",
        type: "multi",
        options: ["Vegetables", "Fruits", "Fish", "Meat", "Poultry", "Canned goods", "Noodles", "Frozen goods", "Other"],
      },
      { code: "nutritional_concerns",   label: "Any nutritional concerns?",       type: "yesno" },
      {
        code: "household_illnesses",
        label: "Chronic illnesses in the household",
        type: "multi",
        options: ["Hypertension", "Diabetes", "Heart illness", "Stroke", "Asthma", "Lung problems", "Other", "None"],
      },
      {
        code: "healthcare_utilization",
        label: "Healthcare utilization pattern",
        type: "single",
        options: [
          "Only when someone is sick",
          "Monthly check-up",
          "For child immunization",
          "Other",
        ],
      },
      {
        code: "primary_consultation",
        label: "First person consulted in illness",
        type: "single",
        options: ["Rural health doctor", "Private doctor", "Midwife", "Nurse", "Relative", "Faith healer", "None"],
      },
      {
        code: "health_insurance",
        label: "Health insurance coverage",
        type: "multi",
        options: ["PhilHealth", "SSS", "Private (HMO / health card)", "None"],
      },
      {
        code: "unmet_medical_need_reason",
        label: "Reason for unmet medical needs",
        type: "single",
        options: ["Financial", "Health-related", "Distance to facility", "Working schedule", "None"],
      },
      { code: "has_pregnant_member", label: "Currently pregnant household member?", type: "yesno" },
      { code: "children_vaccinated", label: "Children fully vaccinated?",            type: "yesno" },
    ],
  },

  // ── Education & participation ─────────────────────────────────────────────────
  {
    key: "education",
    title: "Education & participation",
    fields: [
      { code: "school_aged_children", label: "Number of school-aged children", type: "number" },
      { code: "currently_enrolled",   label: "Currently enrolled in school",   type: "number" },
      {
        code: "highest_attainment",
        label: "Highest educational attainment in household",
        type: "single",
        options: [
          "No formal education",
          "Elementary undergraduate",
          "Elementary graduate",
          "High school undergraduate",
          "High school graduate",
          "Vocational / technical / ALS",
          "College undergraduate",
          "College graduate",
          "Postgraduate",
        ],
      },
      {
        code: "org_involvement",
        label: "Community organization involvement",
        type: "multi",
        options: [
          "Barangay officer / worker",
          "Barangay health worker",
          "Solo parent organization",
          "Senior citizen association",
          "PWD organization",
          "TUPAD",
          "Volunteer / youth group",
          "None",
        ],
      },
      { code: "has_elderly", label: "Has elderly (60+) member?",          type: "yesno" },
      { code: "has_pwd",     label: "Has member with disability (PWD)?",  type: "yesno" },
    ],
  },

  // ── Observations ──────────────────────────────────────────────────────────────
  {
    key: "observations",
    title: "Observations",
    fields: [
      {
        code: "field_observations",
        label: "Field observations (open-ended)",
        type: "longtext",
        help: "Open-ended notes from the interview — issues raised, requests for help, positive observations.",
      },
    ],
  },
];

// Flat lookup for validation / aggregations.
export const PROFILE_FIELDS: Record<string, FieldDef> = Object.fromEntries(
  PROFILE_SECTIONS.flatMap((s) => s.fields.map((f) => [f.code, f]))
);

// Validate a payload against the schema. Strips unknown keys, coerces types,
// and returns either a sanitized object or a string error.
export function sanitizeExtendedData(
  input: unknown
): { value: Record<string, unknown> } | { error: string } {
  if (input == null) return { value: {} };
  if (typeof input !== "object" || Array.isArray(input)) {
    return { error: "extended_data must be an object" };
  }
  const raw = input as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [code, val] of Object.entries(raw)) {
    const field = PROFILE_FIELDS[code];
    if (!field) continue;   // silently drop unknown fields
    if (val == null || val === "") continue;   // empty values stored as absent
    switch (field.type) {
      case "single":
        if (typeof val !== "string") return { error: `${code} must be a string` };
        if (field.options && !field.options.includes(val)) {
          return { error: `${code}: '${val}' is not a valid option` };
        }
        out[code] = val;
        break;
      case "multi":
        if (!Array.isArray(val)) return { error: `${code} must be an array` };
        out[code] = (val as unknown[])
          .filter((v): v is string => typeof v === "string")
          .filter((v) => !field.options || field.options.includes(v));
        break;
      case "number": {
        const n = typeof val === "number" ? val : Number(val);
        if (!Number.isFinite(n)) return { error: `${code} must be a number` };
        out[code] = n;
        break;
      }
      case "yesno":
        if (val === true || val === "yes")      out[code] = "yes";
        else if (val === false || val === "no") out[code] = "no";
        else return { error: `${code} must be yes or no` };
        break;
      case "text":
      case "longtext":
        if (typeof val !== "string") return { error: `${code} must be text` };
        out[code] = val.trim();
        break;
    }
  }
  return { value: out };
}
