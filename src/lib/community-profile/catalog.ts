// Fixed indicator catalog for barangay community profiles (agape.community-profile.v1).
// It mirrors the PARAYA community profiling report, section by section. Keys are
// stable: stored profiles, key figures, and need-suggestion rules refer to them.
// Add categories only at the end of a list; never rename or reuse a key.

export const COMMUNITY_PROFILE_SCHEMA_VERSION = "agape.community-profile.v1";

/** single: each respondent is counted once. multiple: respondents may give several answers. */
export type ResponseType = "single" | "multiple";
/** Who answered: one answer per household, or one per household member. */
export type CountUnit = "households" | "individuals";
export type ProfileCategory = { key: string; label: string };
export type ProfileIndicator = { key: string; label: string; response: ResponseType; unit: CountUnit; categories: readonly ProfileCategory[] };
export type ProfileSection = { key: string; title: string; indicators: readonly ProfileIndicator[] };

type Pair = readonly [key: string, label: string];
const ind = (key: string, label: string, response: ResponseType, unit: CountUnit, pairs: readonly Pair[]): ProfileIndicator =>
  ({ key, label, response, unit, categories: pairs.map(([categoryKey, categoryLabel]) => ({ key: categoryKey, label: categoryLabel })) });
const YES_NO: readonly Pair[] = [["yes", "Yes"], ["no", "No"]];

export const PROFILE_SECTIONS: readonly ProfileSection[] = [
  { key: "demographics", title: "Demographics", indicators: [
    ind("sex", "Sex", "single", "individuals", [["female", "Female"], ["male", "Male"]]),
    ind("civil_status", "Civil status of respondent", "single", "households", [["married", "Married"], ["single", "Single"], ["widowed", "Widowed"], ["live_in_separated", "Live-in or separated"], ["not_specified", "Not specified or other"]]),
    ind("education", "Educational attainment", "single", "individuals", [["not_yet_in_school", "Not yet attending school"], ["pre_elementary", "Pre-elementary"], ["elementary_current", "Elementary, currently enrolled"], ["elementary_undergraduate", "Elementary undergraduate"], ["elementary_graduate", "Elementary graduate"], ["high_school_current", "High school, currently enrolled"], ["high_school_undergraduate", "High school undergraduate"], ["high_school_graduate", "High school graduate"], ["vocational", "Vocational, technical, or ALS"], ["college_current", "College, currently enrolled"], ["college_undergraduate", "College undergraduate"], ["college_graduate", "College graduate"], ["postgraduate", "Postgraduate"], ["not_specified", "Not specified or other"], ["no_education", "No educational background"]]),
  ] },
  { key: "socio_economic", title: "Socio-economic", indicators: [
    ind("monthly_income", "Monthly household income", "single", "households", [["below_5000", "Below ₱5,000"], ["from_5000", "₱5,000–₱9,999"], ["from_10000", "₱10,000–₱19,999"], ["from_20000", "₱20,000–₱39,999"], ["from_40000", "₱40,000–₱59,999"], ["from_60000", "₱60,000 and above"], ["not_specified", "Not specified or other"]]),
    ind("indigenous_identity", "Indigenous identity", "single", "households", YES_NO),
    ind("migrant_worker", "Migrant or overseas worker in household", "single", "households", YES_NO),
  ] },
  { key: "housing", title: "Housing & utilities", indicators: [
    ind("housing_tenure", "Housing tenure", "single", "households", [["owned_paid", "Owned, fully paid"], ["owned_mortgage", "Owned with mortgage"], ["rented", "Rented"], ["informal_settler", "Informal settler"], ["with_relatives", "Living with relatives"], ["not_specified", "Not specified or other"]]),
    ind("electricity", "Electricity", "single", "households", YES_NO),
    ind("internet", "Internet access", "single", "households", YES_NO),
    ind("gardening", "Household gardening", "multiple", "households", [["vegetables", "Vegetables"], ["fruit_bearing", "Fruit-bearing plants"], ["herbal", "Herbal plants"], ["household_garden", "House plants or household garden"], ["community_garden", "Community garden"], ["plants_unspecified", "Plants, unspecified"], ["none", "None"]]),
    ind("waste_disposal", "Waste disposal", "single", "households", [["municipal", "Municipal collection"], ["burned", "Burned"], ["open_dumping", "Open dumping"], ["compost_pit", "Compost pit"], ["other", "Other"]]),
    ind("water_source", "Water source", "single", "households", [["piped", "Piped"], ["nawasa", "NAWASA"], ["delivered", "Delivered"], ["well", "Well"], ["other", "Other"]]),
    ind("toilet", "Toilet facility", "single", "households", [["flush", "Flush toilet"], ["manual_flush", "Manual flush"], ["shared", "Shared toilet"], ["none", "No facility"], ["other", "Other"]]),
    ind("flood_exposure", "Flood exposure", "single", "households", [["flood_prone", "Flood-prone"], ["not_flood_prone", "Not flood-prone"]]),
    ind("flood_monitoring", "Flood monitoring", "multiple", "households", [["sms_social_media", "SMS or social media"], ["public_address", "Public address system"], ["none", "No monitoring"]]),
    ind("transportation", "Primary transportation", "single", "households", [["motorcycle", "Motorcycle"], ["public_transit", "Public transit"], ["tricycle", "Tricycle"], ["walking", "Walking"], ["bicycle", "Bicycle"], ["car", "Car"]]),
    ind("pets", "Household pets and animals", "multiple", "households", [["dogs", "Dogs"], ["cats", "Cats"], ["chickens", "Chickens"], ["ducks", "Ducks"], ["birds", "Birds"], ["fish", "Fish"], ["none", "None"]]),
    ind("devices", "Devices", "multiple", "households", [["smartphone", "Smartphone"], ["tablet", "Tablet or iPad"], ["television", "Television"], ["desktop", "Desktop computer"], ["smart_speaker", "Smart speaker"], ["laptop", "Laptop"], ["none", "None"]]),
    ind("cctv", "CCTV installed", "single", "households", YES_NO),
  ] },
  { key: "health", title: "Health & nutrition", indicators: [
    ind("sleep_hours", "Sleep duration", "single", "households", [["hours_2", "2 hours"], ["hours_4", "4 hours"], ["hours_5", "5 hours"], ["hours_6", "6 hours"], ["hours_7", "7 hours"], ["hours_8", "8 hours"], ["hours_10", "10 hours"], ["other", "Other"]]),
    ind("sleep_disruption", "Sleep-quality disruptions", "single", "households", [["psychological", "Psychological or mental factors"], ["occupational", "Occupational or lifestyle demands"], ["none", "No disruption"], ["environmental", "Environmental disruptions"], ["biological", "Biological or health factors"]]),
    ind("daily_meals", "Meals per day", "single", "households", [["meals_1", "1 meal"], ["meals_2", "2 meals"], ["meals_3", "3 meals"], ["meals_4", "4 meals"], ["meals_5", "5 meals"]]),
    ind("nutrition_concern", "Nutritional concerns", "single", "households", YES_NO),
    ind("food_budget", "Monthly food budget", "single", "households", [["free", "Free"], ["from_500", "₱500–₱999"], ["from_1000", "₱1,000–₱1,499"], ["from_1500", "₱1,500–₱1,999"], ["from_2000", "₱2,000–₱2,499"], ["from_2500", "₱2,500–₱2,999"], ["from_3000", "₱3,000–₱3,499"], ["from_3500", "₱3,500–₱3,999"], ["from_4000", "₱4,000–₱4,999"], ["from_5000", "₱5,000–₱9,999"], ["from_10000", "₱10,000–₱24,999"], ["from_25000", "₱25,000 and above"]]),
    ind("food_consumption", "Food usually consumed", "multiple", "households", [["vegetables", "Vegetables"], ["fish", "Fish"], ["meat", "Meat"], ["poultry", "Poultry"], ["others", "Others"], ["canned_goods", "Canned goods"], ["fruits", "Fruits"], ["noodles", "Noodles"], ["frozen_goods", "Frozen goods"], ["unspecified", "Unspecified"]]),
    ind("child_snacks", "Children's snacks", "multiple", "households", [["biscuits", "Biscuits"], ["unspecified", "Unspecified"], ["junk_food", "Junk food"], ["other", "Other"], ["milk", "Milk"], ["soft_drinks", "Soft drinks"], ["poultry", "Poultry"], ["vegetables", "Vegetables"], ["juice", "Juice"], ["coffee", "Coffee"], ["fish", "Fish"], ["frozen_food", "Frozen food"], ["noodles", "Noodles"], ["canned_goods", "Canned goods"], ["fruits", "Fruits"]]),
    ind("food_storage", "Food storage", "single", "households", [["refrigerator", "Refrigerator"], ["covered_table", "Table with cover"], ["basket", "Basket"], ["plastic", "Plastic"], ["other", "Other"], ["none", "None"]]),
    ind("healthcare_use", "Healthcare utilization", "single", "households", [["when_sick", "Only when a family member is sick"], ["child_immunization", "Child immunization"], ["monthly_checkup", "Monthly check-up"], ["other", "Other"]]),
    ind("first_consultation", "First consultation during illness", "multiple", "households", [["rural_health_doctor", "Rural health doctor"], ["relative", "Relative"], ["private_doctor", "Private doctor"], ["midwife", "Midwife"], ["faith_healer", "Faith healer"], ["nurse", "Nurse"], ["company_clinic", "Company clinic"], ["none", "None"]]),
    ind("unmet_medical_needs", "Unmet medical needs", "multiple", "households", [["none", "None"], ["financial", "Financial matters"], ["health", "Health matters"], ["distance", "Distance"], ["work_schedule", "Work schedule"]]),
    ind("healthcare_access", "Access to healthcare", "single", "households", YES_NO),
    ind("health_insurance", "Health insurance", "multiple", "households", [["none", "None"], ["philhealth", "PhilHealth"], ["sss", "SSS"], ["bdo_life", "BDO Life"], ["health_card", "Health card"]]),
    ind("household_illnesses", "Illnesses in the household", "multiple", "households", [["none", "None"], ["hypertension", "Hypertension"], ["diabetes", "Diabetes"], ["stroke", "Stroke"], ["heart_illness", "Heart illness"], ["seizures", "Seizures"], ["asthma", "Asthma"], ["cerebral_palsy", "Cerebral palsy"], ["orthopedic", "Orthopedic complications"], ["eczema", "Eczema"], ["vertigo", "Vertigo"], ["lung_problems", "Lung problems"], ["cough", "Cough"], ["undiagnosed", "Undiagnosed condition"]]),
    ind("pregnancy", "Current pregnancy", "single", "households", [["months_0_3", "0–3 months"], ["months_4_6", "4–6 months"], ["months_7_9", "7–9 months"], ["none", "None"]]),
    ind("prenatal_supervision", "Prenatal supervision", "single", "households", [["barangay_health_center", "Barangay health center"], ["rural_health_unit", "Rural health unit"], ["lying_in", "Lying-in"], ["municipal_hospital", "Municipal hospital"], ["none", "None"]]),
    ind("recent_deliveries", "Place of recent delivery", "single", "households", [["hospital", "Hospital"], ["lying_in", "Lying-in"], ["home", "Home"], ["none", "None"]]),
    ind("child_vaccination", "Child vaccinations received", "multiple", "households", [["none", "None"], ["hepatitis_b", "Hepatitis B"], ["oral_polio", "Oral polio vaccine"], ["inactivated_polio", "Inactivated polio vaccine"], ["pneumonia", "Pneumonia"], ["bcg", "BCG"], ["influenza", "Influenza"], ["measles", "Measles"], ["pentavalent", "Pentavalent"], ["pneumococcal", "Pneumococcal"], ["mmr", "MMR or mumps"], ["rubella", "Rubella"], ["tuberculosis", "Tuberculosis"], ["vitamin_k", "Vitamin K"], ["not_specified", "Not specified"]]),
  ] },
  { key: "participation", title: "Education & participation", indicators: [
    ind("school_aged_children", "School-aged children per household", "single", "households", [["children_0", "0"], ["children_1", "1"], ["children_2", "2"], ["children_3", "3"], ["children_4", "4"], ["children_5", "5"], ["children_6", "6"]]),
    ind("current_enrollment", "Children currently enrolled per household", "single", "households", [["enrolled_0", "0"], ["enrolled_1", "1"], ["enrolled_2", "2"], ["enrolled_3", "3"], ["enrolled_4", "4"]]),
    ind("income_sources", "Income sources", "multiple", "households", [["salaried", "Salaried employment or wage earner"], ["daily_casual", "Daily or casual work"], ["self_employed", "Self-employment or business"], ["pension", "Pension or retirement"], ["remittances", "Remittances or overseas family support"], ["government_assistance", "Social welfare or government assistance"], ["on_call", "Company driver, extra, on-call, or allowance"], ["other", "Other or mixed"]]),
    ind("income_sufficiency", "Income sufficiency", "single", "households", [["sufficient", "Sufficient"], ["insufficient", "Insufficient"]]),
    ind("government_assistance", "Government assistance received", "single", "households", [["none", "None"], ["four_ps", "4Ps"], ["local_relief", "Local relief aid"], ["sap", "SAP"]]),
    ind("community_organization", "Community organization involvement", "single", "households", [["none", "None"], ["barangay_officers", "Barangay officers or workers"], ["health_worker", "Barangay health worker"], ["solo_parent", "Solo parent organization"], ["senior_citizen", "Senior citizen organization"], ["pwd", "PWD organization"], ["tupad", "TUPAD"], ["volunteer", "Volunteer"]]),
    ind("elderly_members", "Elderly household members", "single", "households", YES_NO),
    ind("disabilities", "Persons with disabilities", "single", "households", [["none", "No disability reported"], ["unspecified", "Unspecified disability"], ["cerebral_palsy", "Cerebral palsy"], ["hearing", "Hearing impairment"], ["paralysis", "Paralysis"]]),
  ] },
];

export const PROFILE_INDICATORS: readonly ProfileIndicator[] = PROFILE_SECTIONS.flatMap((section) => section.indicators);

/** Key figures shown above a profile and compared across barangays in Analytics. */
export const PROFILE_KEY_FIGURES = [
  { key: "low_income", label: "Income below ₱10,000", indicator: "monthly_income", categories: ["below_5000", "from_5000"] },
  { key: "flood_prone", label: "Flood-prone households", indicator: "flood_exposure", categories: ["flood_prone"] },
  { key: "insecure_tenure", label: "Renting or informal settlers", indicator: "housing_tenure", categories: ["rented", "informal_settler"] },
  { key: "no_internet", label: "Without internet", indicator: "internet", categories: ["no"] },
] as const;
