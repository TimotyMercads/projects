"""
data_service.py
----------------
Everything related to loading, storing, and reading the student dataset.

The expected schema matches the AURA_Synthetic_Dataset_Training notebook:
Student_ID, Age, Sex, Program, Year_Level, Scholarship_Status,
Employment_Status, Previous_GPA, Midterm_GPA, Quiz_Average,
Assignment_Average, Laboratory_Average, Final_Exam, Failed_Subjects,
Retaken_Subjects, Attendance_Rate, Absences, Late_Count, LMS_Login_Count,
LMS_Time_Spent, Modules_Viewed, Videos_Watched, Discussion_Posts,
Assignment_Submissions, Study_Hours_Per_Week, Sleep_Hours, Motivation,
Time_Management, Stress_Level, Self_Discipline, Family_Income,
Internet_Quality, Device_Availability, Parent_Education,
Counseling_Attendance, Organization_Participation, Extra_Curricular,
Peer_Interaction, Performance  (target: "At Risk" / "High Performing")

If no dataset has been uploaded yet, every function degrades gracefully
and returns None / demo-friendly defaults so the UI never crashes.
"""

import os
import json
from datetime import datetime

import pandas as pd
import numpy as np
from sqlalchemy import text

from utils.cleaning import clean_dataset
from utils.db import get_engine, is_postgres

TARGET_COLUMN = "Performance"
ID_COLUMN = "Student_ID"

# Columns used to build a composite "overall average" when the dataset
# doesn't ship a single pre-computed grade column.
GRADE_COLUMNS = ["Quiz_Average", "Assignment_Average", "Laboratory_Average", "Final_Exam"]

ALLOWED_EXTENSIONS = {".csv", ".xlsx", ".xls"}

# Every column the `students` table actually has (see schema.sql),
# excluding id/upload_id which are managed internally. Anything in an
# uploaded file that ISN'T in this list is dropped before insertion,
# since (unlike a flat CSV) a fixed DB table can't silently accept an
# unrecognized column.
KNOWN_STUDENT_COLUMNS = [
    "Student_ID", "Age", "Sex", "Program", "Year_Level", "Scholarship_Status",
    "Employment_Status", "Previous_GPA", "Midterm_GPA", "Quiz_Average",
    "Assignment_Average", "Laboratory_Average", "Final_Exam", "Failed_Subjects",
    "Retaken_Subjects", "Attendance_Rate", "Absences", "Late_Count",
    "LMS_Login_Count", "LMS_Time_Spent", "Modules_Viewed", "Videos_Watched",
    "Discussion_Posts", "Assignment_Submissions", "Study_Hours_Per_Week",
    "Sleep_Hours", "Motivation", "Time_Management", "Stress_Level",
    "Self_Discipline", "Family_Income", "Internet_Quality", "Device_Availability",
    "Parent_Education", "Counseling_Attendance", "Organization_Participation",
    "Extra_Curricular", "Peer_Interaction", "Performance",
]

# These INT columns get explicitly rounded before insertion - median
# imputation on an even-count column can produce a fractional value
# (e.g. 2.5), and MySQL's strict mode rejects inserting a float into an
# INT column outright rather than silently truncating it.
INTEGER_COLUMNS = [
    "Age", "Year_Level", "Failed_Subjects", "Retaken_Subjects", "Absences",
    "Late_Count", "LMS_Login_Count", "Discussion_Posts", "Motivation",
    "Time_Management", "Stress_Level", "Self_Discipline", "Counseling_Attendance",
    "Peer_Interaction",
]


class UnsupportedFileType(Exception):
    """Raised when an uploaded file isn't a .csv/.xlsx/.xls."""
    pass


class MissingRequiredColumn(Exception):
    """Raised when an uploaded file has no Student_ID column at all."""
    pass


# --------------------------------------------------------------------------
# Loading / saving - backed by MySQL/Postgres (see schema.sql / utils/db.py)
#
# Every function here is scoped to ONE teacher (teacher_id = users.id),
# via the students.upload_id -> uploads.uploaded_by chain. This is what
# makes "a teacher can only see/edit what they uploaded" true: a teacher
# never gets a DataFrame containing another teacher's students in the
# first place, so every downstream function (which just operates on
# whatever DataFrame it's given) is automatically scoped too.
# --------------------------------------------------------------------------

def has_dataset(teacher_id) -> bool:
    engine = get_engine()
    with engine.connect() as conn:
        count = conn.execute(
            text(
                "SELECT COUNT(*) FROM students s "
                "JOIN uploads u ON s.upload_id = u.id "
                "WHERE u.uploaded_by = :tid"
            ),
            {"tid": teacher_id},
        ).scalar()
    return bool(count)


def load_dataset(teacher_id):
    """Returns a DataFrame of just this teacher's students, or None if empty."""
    engine = get_engine()
    try:
        df = pd.read_sql(
            text(
                "SELECT s.* FROM students s "
                "JOIN uploads u ON s.upload_id = u.id "
                "WHERE u.uploaded_by = :tid"
            ),
            engine,
            params={"tid": teacher_id},
        )
    except Exception:
        return None
    if df.empty:
        return None
    return df.drop(columns=["id", "upload_id"], errors="ignore")


def save_dataset(file_storage, uploaded_by, predict_fn=None):
    """
    Accepts a werkzeug FileStorage, validates it's a .csv/.xlsx/.xls,
    parses it, runs it through the cleaning pipeline, optionally runs
    live model predictions (batched, if predict_fn is given), then
    replaces THIS TEACHER'S OWN rows in `students` (other teachers'
    students are untouched) and logs the upload.

    Raises UnsupportedFileType if the extension isn't allowed, or
    MissingRequiredColumn if there's no Student_ID column at all.
    Returns (df, report).
    """
    filename = file_storage.filename or "dataset"
    ext = os.path.splitext(filename)[1].lower()

    if ext not in ALLOWED_EXTENSIONS:
        raise UnsupportedFileType(
            f'"{filename}" is not applicable — wrong file type. Please upload a .csv or .xlsx file.'
        )

    if ext in (".xlsx", ".xls"):
        raw_df = pd.read_excel(file_storage)
    else:
        raw_df = pd.read_csv(file_storage)

    if ID_COLUMN not in raw_df.columns:
        raise MissingRequiredColumn(
            f'"{filename}" has no "{ID_COLUMN}" column, which is required to identify students.'
        )

    df, report = clean_dataset(raw_df)

    if predict_fn is not None:
        # predict_fn is expected to be model_service.predict_batch, which
        # returns (labels, confidences) computed in one vectorized pass
        # instead of one model call per row - see model_service.py.
        labels, confidences = predict_fn(df)
        df["Predicted_Performance"] = labels
        df["Prediction_Confidence"] = confidences

    # Keep only columns the students table actually has, in a safe order.
    insertable_cols = [c for c in KNOWN_STUDENT_COLUMNS if c in df.columns]
    insertable_cols += [c for c in ("Predicted_Performance", "Prediction_Confidence") if c in df.columns]
    df_to_insert = df[insertable_cols].copy()

    for col in INTEGER_COLUMNS:
        if col in df_to_insert.columns:
            df_to_insert[col] = df_to_insert[col].round().astype("Int64")

    engine = get_engine()
    with engine.begin() as conn:
        # Only this teacher's previous uploads get deactivated - other
        # teachers keep whatever was active for them.
        conn.execute(
            text("UPDATE uploads SET is_active = FALSE WHERE uploaded_by = :tid"),
            {"tid": uploaded_by},
        )
        # .lastrowid works with raw text() INSERTs on MySQL/MariaDB, but
        # Postgres has no equivalent - it needs an explicit RETURNING
        # clause instead. (.inserted_primary_key, the "normal" portable
        # answer, only works with SQLAlchemy's Core insert() construct,
        # not raw text() SQL - doesn't apply here.)
        if is_postgres():
            result = conn.execute(
                text(
                    "INSERT INTO uploads (filename, file_type, row_count, uploaded_by, is_active, clean_report) "
                    "VALUES (:filename, :file_type, :row_count, :uploaded_by, TRUE, :clean_report) "
                    "RETURNING id"
                ),
                {
                    "filename": filename,
                    "file_type": ext.lstrip("."),
                    "row_count": len(df_to_insert),
                    "uploaded_by": uploaded_by,
                    "clean_report": json.dumps(report),
                },
            )
            upload_id = result.scalar()
        else:
            result = conn.execute(
                text(
                    "INSERT INTO uploads (filename, file_type, row_count, uploaded_by, is_active, clean_report) "
                    "VALUES (:filename, :file_type, :row_count, :uploaded_by, TRUE, :clean_report)"
                ),
                {
                    "filename": filename,
                    "file_type": ext.lstrip("."),
                    "row_count": len(df_to_insert),
                    "uploaded_by": uploaded_by,
                    "clean_report": json.dumps(report),
                },
            )
            upload_id = result.lastrowid

        # Only delete THIS teacher's own previous students - a global
        # "DELETE FROM students" would wipe every other teacher's data too.
        conn.execute(
            text(
                "DELETE FROM students WHERE upload_id IN "
                "(SELECT id FROM uploads WHERE uploaded_by = :tid AND id != :new_upload_id)"
            ),
            {"tid": uploaded_by, "new_upload_id": upload_id},
        )
        df_to_insert["upload_id"] = upload_id
        df_to_insert.to_sql("students", conn, if_exists="append", index=False)

    return df, report


def get_upload_history(teacher_id, limit=10):
    """This teacher's uploaded files, most recent first."""
    engine = get_engine()
    with engine.connect() as conn:
        rows = conn.execute(
            text(
                """
                SELECT u.filename, u.file_type, u.row_count, u.is_active, u.uploaded_at,
                       us.full_name AS uploaded_by_name
                FROM uploads u
                LEFT JOIN users us ON u.uploaded_by = us.id
                WHERE u.uploaded_by = :tid
                ORDER BY u.uploaded_at DESC
                LIMIT :limit
                """
            ),
            {"tid": teacher_id, "limit": limit},
        ).mappings().all()
    return [dict(r) for r in rows]


def get_last_clean_report(teacher_id):
    engine = get_engine()
    with engine.connect() as conn:
        row = conn.execute(
            text(
                "SELECT filename, clean_report, uploaded_at FROM uploads "
                "WHERE is_active = TRUE AND uploaded_by = :tid "
                "ORDER BY uploaded_at DESC LIMIT 1"
            ),
            {"tid": teacher_id},
        ).mappings().first()
    if not row or not row["clean_report"]:
        return None
    report = row["clean_report"]
    if isinstance(report, str):
        report = json.loads(report)
    report = dict(report)
    report["filename"] = row["filename"]
    report["cleaned_at"] = row["uploaded_at"].strftime("%Y-%m-%d %H:%M") if row["uploaded_at"] else ""
    return report


# --------------------------------------------------------------------------
# Helpers
# --------------------------------------------------------------------------

def compute_overall_average(row_or_df):
    """Composite academic average from the 4 grade component columns."""
    cols = [c for c in GRADE_COLUMNS if c in row_or_df.index] if isinstance(row_or_df, pd.Series) \
        else [c for c in GRADE_COLUMNS if c in row_or_df.columns]
    if not cols:
        return None
    if isinstance(row_or_df, pd.Series):
        vals = row_or_df[cols].astype(float)
        return round(float(vals.mean()), 1)
    return row_or_df[cols].astype(float).mean(axis=1).round(1)


def status_badge(label):
    """Maps a Performance label (or None) to a (text, css_class) pair."""
    if label == "High Performing":
        return ("High Performing", "badge-success")
    if label == "At Risk":
        return ("At Risk", "badge-danger")
    return ("Unclassified", "badge-warning")


def lms_activity_level(value, df=None):
    """
    Buckets a raw LMS_Login_Count into Low / Medium / High using
    dataset-relative tertiles when a dataset is available, falling back
    to fixed thresholds otherwise.
    """
    if value is None or pd.isna(value):
        return "Unknown"
    if df is not None and "LMS_Login_Count" in df.columns and len(df) >= 3:
        low_cut, high_cut = df["LMS_Login_Count"].quantile([0.33, 0.66])
    else:
        low_cut, high_cut = 60, 140
    if value <= low_cut:
        return "Low"
    if value <= high_cut:
        return "Medium"
    return "High"


# --------------------------------------------------------------------------
# Dashboard
# --------------------------------------------------------------------------

def compute_dashboard_stats(df):
    if df is None:
        return {
            "demo": True,
            "total": 1245,
            "high_performing": 972,
            "at_risk": 273,
        }

    total = len(df)
    high_performing = at_risk = None
    if TARGET_COLUMN in df.columns:
        counts = df[TARGET_COLUMN].value_counts()
        high_performing = int(counts.get("High Performing", 0))
        at_risk = int(counts.get("At Risk", 0))

    return {
        "demo": False,
        "total": total,
        "high_performing": high_performing,
        "at_risk": at_risk,
        "has_labels": TARGET_COLUMN in df.columns,
    }


def get_recent_students(df, n=5):
    if df is None:
        return None

    subset = df.tail(n).copy()
    rows = []
    for _, row in subset.iterrows():
        rows.append(_row_to_summary(row))
    return list(reversed(rows))


def _row_to_summary(row):
    avg = compute_overall_average(row)
    label = row.get(TARGET_COLUMN) if TARGET_COLUMN in row.index else None
    badge_text, badge_class = status_badge(label)
    return {
        "id": row.get(ID_COLUMN, "N/A"),
        "program": row.get("Program", "N/A"),
        "year_level": row.get("Year_Level", "N/A"),
        "average": avg,
        "status_text": badge_text,
        "status_class": badge_class,
    }


# --------------------------------------------------------------------------
# Students list / search
# --------------------------------------------------------------------------

def get_filter_options(df):
    """Distinct values for the Students page filter dropdowns."""
    if df is None:
        return {"programs": [], "years": []}
    programs = sorted(df["Program"].dropna().unique().tolist()) if "Program" in df.columns else []
    years = sorted(df["Year_Level"].dropna().unique().tolist()) if "Year_Level" in df.columns else []
    return {"programs": programs, "years": years}


def get_students_table(df, search="", program="", year="", status="", min_avg=""):
    """
    Filters the roster by any combination of:
      - search: substring match against Student_ID
      - program: exact match against Program (closest available field to
        "Section" - the dataset has no Section column)
      - year: exact match against Year_Level
      - status: exact match against Performance ("At Risk" / "High Performing")
      - min_avg: minimum composite average (Quiz/Assignment/Lab/Final)
    """
    filtered = filter_dataframe(df, search=search, program=program, year=year, status=status, min_avg=min_avg)
    if filtered is None:
        return None
    return [_row_to_summary(row) for _, row in filtered.iterrows()]


def get_student_row(df, student_id):
    if df is None:
        return None
    matches = df[df[ID_COLUMN].astype(str) == str(student_id)]
    if matches.empty:
        return None
    return matches.iloc[0]


# Columns a teacher is allowed to hand-edit from the Student Edit form.
# Deliberately excludes Student_ID (the lookup key) and the
# Predicted_Performance/Prediction_Confidence columns (those are
# computed by the model, not something to hand-type).
EDITABLE_COLUMNS = [c for c in KNOWN_STUDENT_COLUMNS if c != "Student_ID"]

# Drives the Student Edit form: how to label/render each editable field.
# type "select" fields get a dropdown with the given options; everything
# else renders as a number or text input.
FIELD_METADATA = {
    "Age": {"label": "Age", "type": "number", "step": "1"},
    "Sex": {"label": "Sex", "type": "select", "options": ["Male", "Female"]},
    "Program": {"label": "Program", "type": "select", "options": ["BSCS", "BSIT", "BSIS"]},
    "Year_Level": {"label": "Year Level", "type": "select", "options": ["1", "2", "3", "4"]},
    "Scholarship_Status": {"label": "Scholarship Status", "type": "select", "options": ["Yes", "No"]},
    "Employment_Status": {"label": "Employment Status", "type": "select", "options": ["Employed", "Unemployed"]},
    "Previous_GPA": {"label": "Previous GPA", "type": "number", "step": "0.01"},
    "Midterm_GPA": {"label": "Midterm GPA", "type": "number", "step": "0.01"},
    "Quiz_Average": {"label": "Quiz Average", "type": "number", "step": "0.1"},
    "Assignment_Average": {"label": "Assignment Average", "type": "number", "step": "0.1"},
    "Laboratory_Average": {"label": "Laboratory Average", "type": "number", "step": "0.1"},
    "Final_Exam": {"label": "Final Exam", "type": "number", "step": "0.1"},
    "Failed_Subjects": {"label": "Failed Subjects", "type": "number", "step": "1"},
    "Retaken_Subjects": {"label": "Retaken Subjects", "type": "number", "step": "1"},
    "Attendance_Rate": {"label": "Attendance Rate (%)", "type": "number", "step": "0.1"},
    "Absences": {"label": "Absences", "type": "number", "step": "1"},
    "Late_Count": {"label": "Late Count", "type": "number", "step": "1"},
    "LMS_Login_Count": {"label": "LMS Login Count", "type": "number", "step": "1"},
    "LMS_Time_Spent": {"label": "LMS Time Spent (min)", "type": "number", "step": "0.1"},
    "Modules_Viewed": {"label": "Modules Viewed", "type": "number", "step": "0.1"},
    "Videos_Watched": {"label": "Videos Watched", "type": "number", "step": "0.1"},
    "Discussion_Posts": {"label": "Discussion Posts", "type": "number", "step": "1"},
    "Assignment_Submissions": {"label": "Assignment Submissions", "type": "number", "step": "0.1"},
    "Study_Hours_Per_Week": {"label": "Study Hours / Week", "type": "number", "step": "0.1"},
    "Sleep_Hours": {"label": "Sleep Hours", "type": "number", "step": "0.1"},
    "Motivation": {"label": "Motivation (1-5)", "type": "number", "step": "1"},
    "Time_Management": {"label": "Time Management (1-5)", "type": "number", "step": "1"},
    "Stress_Level": {"label": "Stress Level (1-5)", "type": "number", "step": "1"},
    "Self_Discipline": {"label": "Self-Discipline (1-5)", "type": "number", "step": "1"},
    "Family_Income": {"label": "Family Income", "type": "select", "options": ["Low", "Middle", "High"]},
    "Internet_Quality": {"label": "Internet Quality", "type": "select", "options": ["Poor", "Average", "Good"]},
    "Device_Availability": {"label": "Device Availability", "type": "select", "options": ["Personal", "Shared"]},
    "Parent_Education": {"label": "Parent Education", "type": "select", "options": ["High School", "College", "Postgraduate"]},
    "Counseling_Attendance": {"label": "Counseling Attendance", "type": "number", "step": "1"},
    "Organization_Participation": {"label": "Organization Participation", "type": "select", "options": ["Yes", "No"]},
    "Extra_Curricular": {"label": "Extra Curricular", "type": "select", "options": ["Yes", "No"]},
    "Peer_Interaction": {"label": "Peer Interaction (1-5)", "type": "number", "step": "1"},
    "Performance": {"label": "Performance", "type": "select", "options": ["At Risk", "High Performing"]},
}


def get_edit_fields(row):
    """Builds the ordered list of {name, label, type, value, options} the
    Student Edit form renders - one generic template loop instead of 37
    hand-written form fields."""
    fields = []
    for col in EDITABLE_COLUMNS:
        meta = FIELD_METADATA.get(col, {"label": col.replace("_", " "), "type": "text"})
        value = row.get(col, "")
        if value is None or (isinstance(value, float) and pd.isna(value)):
            value = ""
        fields.append({
            "name": col,
            "label": meta["label"],
            "type": meta["type"],
            "options": meta.get("options"),
            "step": meta.get("step"),
            "value": value,
        })
    return fields


def update_student(teacher_id, student_id, updates: dict):
    """
    Updates one student's fields, but ONLY if that student belongs to
    an upload owned by teacher_id - the WHERE clause itself enforces
    "a teacher can only edit what they uploaded", not just the calling
    route. Returns True if a row was actually updated, False if no
    matching (and owned) student was found.
    """
    updates = {k: v for k, v in updates.items() if k in EDITABLE_COLUMNS}
    if not updates:
        return False

    set_clause = ", ".join(f"{col} = :{col}" for col in updates)
    params = dict(updates)
    params["student_id"] = student_id
    params["tid"] = teacher_id

    engine = get_engine()
    with engine.begin() as conn:
        result = conn.execute(
            text(
                f"""
                UPDATE students SET {set_clause}
                WHERE Student_ID = :student_id
                AND upload_id IN (SELECT id FROM uploads WHERE uploaded_by = :tid)
                """
            ),
            params,
        )
        return result.rowcount > 0


def build_student_summary(row, df=None):
    """Everything the insights page needs about one student."""
    avg = compute_overall_average(row)
    label = row.get(TARGET_COLUMN) if TARGET_COLUMN in row.index else None
    badge_text, badge_class = status_badge(label)

    components = []
    labels_map = {
        "Quiz_Average": "Quizzes",
        "Assignment_Average": "Assignments",
        "Laboratory_Average": "Laboratory",
        "Final_Exam": "Final Exam",
    }
    for col, label_name in labels_map.items():
        if col in row.index and pd.notna(row[col]):
            val = float(row[col])
            components.append({
                "label": label_name,
                "value": round(val, 1),
                "bar_class": "green" if val >= 85 else ("yellow" if val >= 70 else "red"),
            })

    lms_logins = row.get("LMS_Login_Count", None)

    return {
        "id": row.get(ID_COLUMN, "N/A"),
        "program": row.get("Program", "N/A"),
        "year_level": row.get("Year_Level", "N/A"),
        "sex": row.get("Sex", "N/A"),
        "age": row.get("Age", "N/A"),
        "attendance": row.get("Attendance_Rate", None),
        "average": avg,
        "study_hours": row.get("Study_Hours_Per_Week", None),
        "failed_subjects": row.get("Failed_Subjects", None),
        "absences": row.get("Absences", None),
        "lms_logins": lms_logins,
        "lms_activity": lms_activity_level(lms_logins, df),
        "status_text": badge_text,
        "status_class": badge_class,
        "components": components,
        "raw": row,
    }


# --------------------------------------------------------------------------
# Analytics
# --------------------------------------------------------------------------

def build_analytics(df):
    if df is None:
        return None

    overall_avg = compute_overall_average(df)
    avg_grade = round(float(overall_avg.mean()), 1) if overall_avg is not None else None
    avg_attendance = round(float(df["Attendance_Rate"].mean()), 1) if "Attendance_Rate" in df.columns else None

    performance_counts = {}
    ai_summary = []
    if TARGET_COLUMN in df.columns:
        counts = df[TARGET_COLUMN].value_counts()
        performance_counts = {k: int(v) for k, v in counts.items()}
        total = len(df)
        high = performance_counts.get("High Performing", 0)
        at_risk = performance_counts.get("At Risk", 0)
        if total:
            ai_summary.append(f"{round(high / total * 100, 1)}% of students are currently classified High Performing.")
        if at_risk:
            ai_summary.append(f"{at_risk} student(s) are currently classified At Risk and may need intervention.")

        if "Attendance_Rate" in df.columns:
            encoded = (df[TARGET_COLUMN] == "High Performing").astype(int)
            corr = df["Attendance_Rate"].corr(encoded)
            if pd.notna(corr):
                direction = "positively" if corr > 0 else "negatively"
                ai_summary.append(
                    f"Attendance rate is {direction} correlated with high performance "
                    f"(r = {round(corr, 2)}) in this dataset — this is an observed "
                    f"correlation, not a proven cause."
                )

    # Attendance by year level (replaces the "monthly trend" placeholder,
    # since this dataset is a single snapshot, not a time series)
    attendance_by_year = {}
    if "Year_Level" in df.columns and "Attendance_Rate" in df.columns:
        grouped = df.groupby("Year_Level")["Attendance_Rate"].mean().round(1)
        attendance_by_year = {str(k): float(v) for k, v in grouped.items()}

    # Academic component breakdown (replaces "subject comparison" placeholder,
    # since the dataset has no per-subject grades, only components)
    component_breakdown = {}
    for col in GRADE_COLUMNS:
        if col in df.columns:
            component_breakdown[col.replace("_", " ")] = round(float(df[col].mean()), 1)

    return {
        "avg_grade": avg_grade,
        "avg_attendance": avg_attendance,
        "at_risk_count": performance_counts.get("At Risk", 0),
        "performance_counts": performance_counts,
        "attendance_by_year": attendance_by_year,
        "component_breakdown": component_breakdown,
        "ai_summary": ai_summary,
    }


# --------------------------------------------------------------------------
# Recommendations
# --------------------------------------------------------------------------

def build_risk_buckets(df):
    if df is None:
        return None

    if TARGET_COLUMN not in df.columns:
        return {"high_risk": [], "monitor": [], "low_risk": [], "counts": (0, 0, 0)}

    at_risk = df[df[TARGET_COLUMN] == "At Risk"]

    high_performing = df[df[TARGET_COLUMN] == "High Performing"]
    borderline_mask = pd.Series(False, index=high_performing.index)
    if "Attendance_Rate" in df.columns:
        borderline_mask |= high_performing["Attendance_Rate"] < 80
    if "Final_Exam" in df.columns:
        borderline_mask |= high_performing["Final_Exam"] < 70
    monitor = high_performing[borderline_mask]
    low_risk = high_performing[~borderline_mask]

    return {
        "high_risk": [_row_to_summary(r) for _, r in at_risk.head(10).iterrows()],
        "monitor": [_row_to_summary(r) for _, r in monitor.head(10).iterrows()],
        "low_risk_count": len(low_risk),
        "counts": (len(at_risk), len(monitor), len(low_risk)),
    }


# --------------------------------------------------------------------------
# Downloads / exports
# --------------------------------------------------------------------------

def build_enriched_dataframe(df, model_predict_batch_fn=None):
    """
    Returns a copy of df with computed columns teachers actually want in
    an export: Overall_Average, LMS_Activity_Level, and - if a batch
    prediction function is supplied (model_service.predict_batch) -
    Predicted_Performance / Prediction_Confidence for every row,
    computed in one vectorized pass rather than one call per row.
    """
    if df is None:
        return None

    export_df = df.copy()

    avg = compute_overall_average(export_df)
    export_df["Overall_Average"] = avg

    if "LMS_Login_Count" in export_df.columns:
        export_df["LMS_Activity_Level"] = export_df["LMS_Login_Count"].apply(
            lambda v: lms_activity_level(v, export_df)
        )

    if model_predict_batch_fn is not None and not export_df.empty:
        labels, confidences = model_predict_batch_fn(export_df)
        export_df["Predicted_Performance"] = labels
        export_df["Prediction_Confidence"] = confidences

    return export_df


def filter_dataframe(df, search="", program="", year="", status="", min_avg=""):
    """
    Same filtering logic as get_students_table, but returns the filtered
    DataFrame itself (for exports) instead of summary dicts (for display).
    """
    if df is None:
        return None

    filtered = df.copy()

    if search:
        s = search.strip().lower()
        filtered = filtered[filtered[ID_COLUMN].astype(str).str.lower().str.contains(s)]

    if program and "Program" in filtered.columns:
        filtered = filtered[filtered["Program"].astype(str) == program]

    if year and "Year_Level" in filtered.columns:
        filtered = filtered[filtered["Year_Level"].astype(str) == str(year)]

    if status and TARGET_COLUMN in filtered.columns:
        filtered = filtered[filtered[TARGET_COLUMN] == status]

    if min_avg:
        try:
            threshold = float(min_avg)
            avgs = compute_overall_average(filtered)
            if avgs is not None:
                filtered = filtered[avgs >= threshold]
        except ValueError:
            pass

    return filtered
