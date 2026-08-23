# Survey Preview — Layout Design

Source: [`SurveyPreview` component](../src/app/(dashboard)/officer/surveys/page.tsx#L347-L500)

The Preview tab inside the Survey Builder renders a read-only mock of the published survey as a respondent would see it. It lives inside the builder's tab strip alongside Builder / Settings / Preview and shares state with the live form.

---

## 1. Page Frame

```
┌──────────────────────────────────────────────────────────────┐
│                  (Builder Tab Bar — Preview active)          │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│   ┌────────────────────────────────────────────────────┐     │
│   │  [Header Card]                                     │     │
│   ├────────────────────────────────────────────────────┤     │
│   │  [Section Card 1]                                  │     │
│   ├────────────────────────────────────────────────────┤     │
│   │  [Section Card 2]                                  │     │
│   ├────────────────────────────────────────────────────┤     │
│   │  ...                                               │     │
│   └────────────────────────────────────────────────────┘     │
│                                       [Submit (disabled)]    │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

- Outer wrapper: `max-w-2xl mx-auto space-y-5` — centered narrow column with vertical rhythm between cards.
- Each block is a rounded card on the warm `bg-card` surface with `border border-border` and `shadow-sm`.

---

## 2. Header Card

```
┌────────────────────────────────────────────────────┐
│  Survey Title (Playfair Display, 2xl, semibold)    │
│  Optional description in muted body text…          │
└────────────────────────────────────────────────────┘
```

- Container: `bg-card border border-border rounded-xl p-6 shadow-sm`.
- Title: `font-heading text-2xl font-semibold text-foreground`.
- Description: `text-muted-foreground text-sm mt-2 leading-relaxed`. Hidden if empty.

**Empty state:** if `title` is blank, the entire preview is replaced by a centered hint — *"Add a title in the Builder tab to preview the survey."*

---

## 3. Section Card

Sections render only when they contain at least one question. Section header is omitted when there's a single section.

```
┌────────────────────────────────────────────────────┐
│  Section Title (secondary/50 strip, base, bold)    │ ← only if multiple sections
├────────────────────────────────────────────────────┤
│                                                    │
│   1. Question text *                               │
│      [ field renderer per question_type ]          │
│                                                    │
│   2. Question text                                 │
│      [ field renderer ]                            │
│                                                    │
│   …                                                │
│                                                    │
└────────────────────────────────────────────────────┘
```

- Container: `bg-card border border-border rounded-xl overflow-hidden shadow-sm`.
- Section header strip: `px-6 py-3 bg-secondary/50 border-b border-border` with `font-heading text-base font-semibold`.
- Body: `p-6 space-y-6` between questions.
- Question number is per-section (`idx + 1`), restarting at 1 in each section.
- Required marker: red `*` (`text-danger ml-1`) when `is_required`.
- Untitled questions show italic muted placeholder *"(untitled question)"*.
- Conditional questions disappear from the list unless their parent answer matches `conditional_value` (live in preview state).

---

## 4. Question Renderers

### 4a. Text (`question_type: "text"`)
```
┌────────────────────────────────────────────────────┐
│  Your answer…                                      │
│                                                    │
└────────────────────────────────────────────────────┘
```
- 2-row `Textarea`, `resize-none`, `focus-visible:ring-primary/30`.

### 4b. Rating (`"rating"`) — 1–5
```
( 1 )  ( 2 )  ( 3 )  ( 4 )  ( 5 )
```
- Five circular buttons, `w-10 h-10 rounded-full`.
- Inactive: border + muted text + hover `border-primary/50`.
- Active: `bg-primary border-primary text-primary-foreground` (filled brown circle).

### 4c. Multiple Choice (`"multiple_choice"`) — single select
```
○ Option A
● Option B        ← selected: brown ring with brown inner dot
○ Option C
```
- Radio dot built from divs: outer `w-4 h-4 rounded-full border-2`, inner `w-2 h-2 rounded-full bg-primary` only when selected.
- Whole row is clickable (`cursor-pointer group`); hover lightens border to `primary/50`.
- Empty option strings are filtered out.

### 4d. Checkbox (`"checkbox"`) — multi-select
```
☑ Option A        ← checked: filled brown square with white check
☐ Option B
☑ Option C
```
- Square `w-4 h-4 rounded border-2`. When checked: `border-primary bg-primary` with a white `Check` icon (`w-2.5 h-2.5`).
- Toggles add/remove from the answer array; rest of the row visuals mirror multiple choice.

---

## 5. Submit Row

```
                                          [ Submit (preview only) ]
```

- Right-aligned via `flex justify-end`.
- Button: `bg-primary hover:bg-primary-dark text-primary-foreground`, permanently `disabled` — the preview never posts.

---

## 6. State & Behavior Notes

- `answers` is local React state, not persisted; switching tabs resets nothing because the builder owns the questions array.
- `isVisible(q)` gates conditional questions in real time: text/radio answers match by equality, checkbox answers match if the array includes `conditional_value`.
- Sections with zero questions are skipped entirely (no empty cards).
- If no sections have questions at all, a dashed empty-state box replaces the section list: *"No questions added yet."*

---

## 7. Color & Spacing Tokens (from the PARAYA theme)

| Token | Use in preview |
|---|---|
| `bg-card` / `border-border` | All card surfaces and dividers |
| `bg-secondary/50` | Section header strip |
| `text-foreground` / `text-muted-foreground` | Labels vs. helper text |
| `bg-primary` (`#6B5B3E`) | Selected radio dot, filled checkbox, rating button fill, Submit |
| `text-danger` (`#9B3B3B`) | Required asterisk |
| `rounded-xl` / `rounded-lg` / `rounded-full` | Cards / inputs / radio + rating buttons |
| `shadow-sm` | Soft warm card elevation |
