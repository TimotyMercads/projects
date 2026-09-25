"""
cleaning.py
-----------
Runs automatically on every dataset upload (see data_service.save_dataset).
Cleans common messiness in real-world CSV/XLSX exports without silently
destroying data the teacher might need to investigate - every change is
counted and returned in a report dict that the Upload page displays.

What it does, in order:
  1. Strips whitespace from column headers and text cells.
  2. Treats empty strings as missing values.
  3. Drops rows that are entirely empty.
  4. Drops exact duplicate rows.
  5. Drops duplicate Student_ID rows (keeps the first occurrence).
  6. Coerces numeric columns to actual numbers (bad entries -> missing).
  7. Clips out-of-range numeric values to sane bounds (e.g. a 150%
     attendance rate becomes 100%).
  8. Normalizes categorical text casing (" male " -> "Male").
  9. Imputes remaining missing values (median for numeric, most frequent
     for categorical) so every page and the prediction pipeline can rely
     on a complete row - the report lists exactly what was filled in.

Nothing here invents data that wasn't inferable from the column itself;
it never guesses at a specific student's grade, for example - it only
fills gaps with the dataset's own median/mode, and always says so.
"""

import pandas as pd

ID_COLUMN = "Student_ID"

# (column, min, max) - None means "no bound on that side"
NUMERIC_BOUNDS = [
    ("Age", 15, 60),
    ("Year_Level", 1, 6),
    ("Previous_GPA", 1.0, 5.0),
    ("Midterm_GPA", 1.0, 5.0),
    ("Quiz_Average", 0, 100),
    ("Assignment_Average", 0, 100),
    ("Laboratory_Average", 0, 100),
    ("Final_Exam", 0, 100),
    ("Failed_Subjects", 0, None),
    ("Retaken_Subjects", 0, None),
    ("Attendance_Rate", 0, 100),
    ("Absences", 0, None),
    ("Late_Count", 0, None),
    ("LMS_Login_Count", 0, None),
    ("LMS_Time_Spent", 0, None),
    ("Modules_Viewed", 0, None),
    ("Videos_Watched", 0, None),
    ("Discussion_Posts", 0, None),
    ("Assignment_Submissions", 0, None),
    ("Study_Hours_Per_Week", 0, 168),
    ("Sleep_Hours", 0, 24),
    ("Motivation", 1, 5),
    ("Time_Management", 1, 5),
    ("Stress_Level", 1, 5),
    ("Self_Discipline", 1, 5),
    ("Counseling_Attendance", 0, None),
    ("Peer_Interaction", 1, 5),
]

CATEGORICAL_COLUMNS = [
    "Sex", "Program", "Scholarship_Status", "Employment_Status",
    "Family_Income", "Internet_Quality", "Device_Availability",
    "Parent_Education", "Organization_Participation", "Extra_Curricular",
    "Performance",
]


def clean_dataset(df: pd.DataFrame):
    """Returns (cleaned_df, report). Never raises on messy input."""
    report = {
        "original_rows": int(len(df)),
        "empty_rows_removed": 0,
        "duplicate_rows_removed": 0,
        "duplicate_ids_removed": 0,
        "columns_trimmed": [],
        "numeric_values_coerced": {},
        "values_clipped": {},
        "categorical_values_normalized": [],
        "missing_before_impute": {},
        "values_imputed": {},
        "final_rows": 0,
    }

    df = df.copy()

    # 1. Clean up column headers themselves
    df.columns = [str(c).strip() for c in df.columns]

    # 2. Trim whitespace on text columns, turn "" into NaN
    text_cols = df.select_dtypes(include=["object", "string"]).columns.tolist()
    for col in text_cols:
        before = df[col].copy()
        df[col] = df[col].astype(str).str.strip()
        df[col] = df[col].replace({"": None, "nan": None, "None": None})
        if not before.astype(str).equals(df[col].astype(str)):
            report["columns_trimmed"].append(col)

    # 3. Drop fully-empty rows
    empty_mask = df.isna().all(axis=1)
    report["empty_rows_removed"] = int(empty_mask.sum())
    df = df[~empty_mask]

    # 4. Drop exact duplicate rows
    dup_mask = df.duplicated()
    report["duplicate_rows_removed"] = int(dup_mask.sum())
    df = df[~dup_mask]

    # 5. Drop duplicate Student_IDs, keep first
    if ID_COLUMN in df.columns:
        id_dup_mask = df.duplicated(subset=[ID_COLUMN])
        report["duplicate_ids_removed"] = int(id_dup_mask.sum())
        df = df[~id_dup_mask]

    # 6. Coerce numeric columns
    for col, lo, hi in NUMERIC_BOUNDS:
        if col not in df.columns:
            continue
        original_notna = df[col].notna()
        coerced = pd.to_numeric(df[col], errors="coerce")
        newly_invalid = int((original_notna & coerced.isna()).sum())
        if newly_invalid:
            report["numeric_values_coerced"][col] = newly_invalid
        df[col] = coerced

    # 7. Clip out-of-range values
    for col, lo, hi in NUMERIC_BOUNDS:
        if col not in df.columns:
            continue
        mask = pd.Series(False, index=df.index)
        if lo is not None:
            mask |= df[col] < lo
        if hi is not None:
            mask |= df[col] > hi
        clipped_count = int(mask.sum())
        if clipped_count:
            report["values_clipped"][col] = clipped_count
            df[col] = df[col].clip(lower=lo, upper=hi)

    # 8. Normalize categorical text casing
    for col in CATEGORICAL_COLUMNS:
        if col not in df.columns:
            continue
        before = df[col].copy()

        def _normalize(v):
            if pd.isna(v):
                return v
            v = str(v).strip()
            # Keep known multi-word / mixed-case labels intact where a
            # simple title-case would break them (e.g. "BSCS").
            if v.isupper() and len(v) <= 6:
                return v
            return v.title() if v.islower() or v.isupper() else v

        df[col] = df[col].apply(_normalize)
        if not before.astype(str).equals(df[col].astype(str)):
            report["categorical_values_normalized"].append(col)

    # 9. Report missing values before imputation
    for col in df.columns:
        missing = int(df[col].isna().sum())
        if missing:
            report["missing_before_impute"][col] = missing

    # 10. Impute remaining missing values
    for col in df.columns:
        if col == ID_COLUMN:
            continue
        missing = int(df[col].isna().sum())
        if not missing:
            continue
        if pd.api.types.is_numeric_dtype(df[col]):
            fill_value = df[col].median()
            if pd.isna(fill_value):
                continue
            df[col] = df[col].fillna(fill_value)
            report["values_imputed"][col] = {"count": missing, "method": "median", "value": round(float(fill_value), 2)}
        else:
            mode = df[col].mode(dropna=True)
            fill_value = mode.iloc[0] if not mode.empty else "Unknown"
            df[col] = df[col].fillna(fill_value)
            report["values_imputed"][col] = {"count": missing, "method": "most frequent", "value": str(fill_value)}

    df = df.reset_index(drop=True)
    report["final_rows"] = int(len(df))

    return df, report
