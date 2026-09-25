"""
model_service.py
-----------------
Loads the trained model artifacts produced by the
AURA_Synthetic_Dataset_Training notebook (PART 11 - "Save Everything"):

    models/Best_Model.pkl          -> the winning classifier
    models/Scaler.pkl              -> StandardScaler fit on numeric columns
    models/TargetEncoder.pkl       -> LabelEncoder for the "Performance" target
    models/Categorical_Encoders.pkl-> dict of LabelEncoders, one per categorical column
    models/KMeans.pkl              -> OPTIONAL, only needed if the winning model
                                       was one of the "KMeans + ..." hybrids
    models/Best_RandomForest.pkl   -> OPTIONAL fallback, used automatically if
                                       Best_Model.pkl's expected features don't
                                       match the current Scaler/Encoders

Nothing in this file assumes the files exist. Every public function checks
is_ready() first and the routes fall back to a "demo mode" banner when the
model isn't loaded yet, so the app runs fine before you upload anything.

IMPORTANT - schema safety:
Some projects end up with a Best_Model.pkl trained on an older column
schema than the current Scaler.pkl/Categorical_Encoders.pkl were fit on
(e.g. the dataset's columns got renamed between training runs). Predicting
with a mismatched model would silently produce meaningless results, so
this module checks the model's expected feature names against what the
encoders/scaler actually provide, and:
  - uses Best_Model.pkl if it matches,
  - otherwise falls back to Best_RandomForest.pkl if THAT matches,
  - otherwise reports the mismatch instead of guessing.
"""

import os
import joblib
import numpy as np
import pandas as pd

from utils import plain_language

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODEL_DIR = os.path.join(BASE_DIR, "models")

FILES = {
    "model": "Best_Model.pkl",
    "model_fallback": "Best_RandomForest.pkl",
    "scaler": "Scaler.pkl",
    "target_encoder": "TargetEncoder.pkl",
    "encoders": "Categorical_Encoders.pkl",
    "kmeans": "KMeans.pkl",  # optional
}

REQUIRED = ["model", "scaler", "target_encoder", "encoders"]

_cache = {}
_explainer_cache = {}


def _path(name):
    return os.path.join(MODEL_DIR, FILES[name])


def _load(name):
    if name in _cache:
        return _cache[name]
    path = _path(name)
    if not os.path.exists(path):
        return None
    obj = joblib.load(path)
    _cache[name] = obj
    return obj


def reload_all():
    """Clears the in-memory cache so freshly-dropped .pkl files get picked up."""
    _cache.clear()
    _explainer_cache.clear()


def is_ready() -> bool:
    return all(os.path.exists(_path(name)) for name in REQUIRED)


def missing_files():
    return [FILES[name] for name in REQUIRED if not os.path.exists(_path(name))]


def file_status():
    """Returns {'model': True, 'scaler': False, ...} for the UI to display."""
    return {name: os.path.exists(_path(name)) for name in FILES}


def get_scaler():
    return _load("scaler")


def get_target_encoder():
    return _load("target_encoder")


def get_encoders():
    return _load("encoders") or {}


def get_kmeans():
    return _load("kmeans")


def _expected_columns():
    """
    The source of truth for what columns a compatible model must accept:
    every categorical column the encoders were fit on, plus every numeric
    column the scaler was fit on.
    """
    encoders = get_encoders()
    scaler = get_scaler()
    cat_cols = set(encoders.keys())
    num_cols = set(getattr(scaler, "feature_names_in_", []))
    return cat_cols | num_cols


def _model_matches_schema(model) -> bool:
    names = getattr(model, "feature_names_in_", None)
    if names is None:
        # Older sklearn / models without stored feature names - assume OK,
        # we can't verify further than shape at predict time.
        return True
    expected = _expected_columns()
    if not expected:
        return True
    # Allow the model to also expect an extra "Cluster" column (KMeans hybrids)
    model_cols = set(names) - {"Cluster"}
    return model_cols == expected


def get_model():
    """
    Returns (model, name_used) where name_used is 'model' or 'model_fallback',
    or (None, None) if nothing usable is loaded. Automatically steps around
    a Best_Model.pkl that was trained on a different column schema than the
    current Scaler/Categorical_Encoders.
    """
    primary = _load("model")
    if primary is not None and _model_matches_schema(primary):
        return primary, "model"

    fallback = _load("model_fallback")
    if fallback is not None and _model_matches_schema(fallback):
        return fallback, "model_fallback"

    # Nothing matches the current schema - return whatever primary is
    # (caller / predict_student will surface the mismatch clearly) or None.
    return primary, "model" if primary is not None else (None, None)


def schema_status():
    """
    Diagnostic info for the Upload page: which model file (if any) is
    actually compatible with the current Scaler/Encoders, and why not,
    for the other one.
    """
    expected = _expected_columns()
    result = {"expected_columns": sorted(expected), "models": {}}
    for key in ("model", "model_fallback"):
        m = _load(key)
        if m is None:
            result["models"][FILES[key]] = {"present": False}
            continue
        names = getattr(m, "feature_names_in_", None)
        matches = _model_matches_schema(m)
        result["models"][FILES[key]] = {
            "present": True,
            "matches_current_schema": matches,
            "feature_names": list(names) if names is not None else None,
        }
    return result


# --------------------------------------------------------------------------
# Preprocessing - mirrors the notebook's preprocessing exactly, done in
# one vectorized pass over a whole DataFrame rather than row-by-row.
# This is what makes predict_batch fast: encoding a column of 3,000
# values with encoder.transform()-equivalent logic is one operation,
# not 3,000 separate Python-level calls.
# --------------------------------------------------------------------------

def _prepare_features_batch(df: pd.DataFrame, feature_columns, numerical_columns, categorical_columns):
    """
    Vectorized equivalent of encoding+scaling a whole DataFrame at once.
    Unseen categorical values fall back to class 0, same as the
    single-row path - just computed with .map() over the whole column
    instead of a try/except per value.
    """
    encoders = get_encoders()
    data = {}
    for col in feature_columns:
        if col not in df.columns:
            data[col] = 0
            continue
        series = df[col]
        if col in categorical_columns:
            encoder = encoders.get(col)
            if encoder is not None:
                class_to_code = {cls: i for i, cls in enumerate(encoder.classes_)}
                series = series.map(class_to_code).fillna(0).astype(int)
        data[col] = series.values

    batch = pd.DataFrame(data, index=df.index)

    scaler = get_scaler()
    if scaler is not None:
        present_numeric = [c for c in numerical_columns if c in batch.columns]
        if present_numeric:
            batch[present_numeric] = scaler.transform(batch[present_numeric])

    return batch


def _resolve_feature_lists(row_or_df, model):
    """
    Categorical/numerical split comes from the fitted encoders/scaler
    themselves (source of truth from training), not re-inferred from
    dtypes. Column order follows the model's own feature_names_in_ when
    available, otherwise the data's natural order (minus the target).
    Works for either a single row (Series) or a whole DataFrame.
    """
    encoders = get_encoders()
    scaler = get_scaler()
    categorical_columns = list(encoders.keys())
    numerical_columns = list(getattr(scaler, "feature_names_in_", []))

    model_names = getattr(model, "feature_names_in_", None)
    if model_names is not None:
        feature_columns = [c for c in model_names if c != "Cluster"]
    else:
        columns = row_or_df.index if isinstance(row_or_df, pd.Series) else row_or_df.columns
        feature_columns = [c for c in columns if c != "Performance"]

    return feature_columns, numerical_columns, categorical_columns


def _add_cluster_column_batch(batch, model, numerical_columns):
    expected_n = getattr(model, "n_features_in_", None)
    if expected_n is not None and batch.shape[1] < expected_n:
        kmeans = get_kmeans()
        if kmeans is not None:
            numeric_only = batch[[c for c in numerical_columns if c in batch.columns]]
            batch["Cluster"] = kmeans.predict(numeric_only)
    return batch


def predict_batch(df: pd.DataFrame):
    """
    Predicts Performance for every row in df in one vectorized pass -
    one preprocessing pass and one model.predict_proba() call for the
    WHOLE batch, instead of looping row-by-row. Used for bulk upload
    predictions and CSV exports, where row-by-row calls previously took
    noticeably longer (a few minutes for a few thousand rows).

    Returns (labels: list[str|None], confidences: list[float|None]),
    same length/order as df. A row gets (None, None) if the model isn't
    ready or the schema doesn't match - callers already handle that.
    """
    n = len(df)
    if not is_ready() or n == 0:
        return [None] * n, [None] * n

    model, model_key = get_model()
    if model is None or not _model_matches_schema(model):
        return [None] * n, [None] * n

    try:
        feature_columns, numerical_columns, categorical_columns = _resolve_feature_lists(df, model)
        batch = _prepare_features_batch(df, feature_columns, numerical_columns, categorical_columns)
        batch = _add_cluster_column_batch(batch, model, numerical_columns)

        target_encoder = get_target_encoder()
        predictions = model.predict(batch)
        labels = [str(l) for l in target_encoder.inverse_transform(predictions)]

        confidences = [None] * n
        if hasattr(model, "predict_proba"):
            proba = model.predict_proba(batch)
            confidences = [round(float(max(p)) * 100, 1) for p in proba]

        return labels, confidences
    except Exception:
        return [None] * n, [None] * n


def predict_student(row: pd.Series):
    """
    Single-student version of predict_batch, used by the Student
    Insights page. Internally just runs predict_batch on a 1-row
    DataFrame so both paths share one preprocessing implementation.

    Returns a dict: {label, confidence, probabilities, model_used} or
    {error: ...} if the model isn't loaded / schema doesn't match / the
    prediction fails for any reason.
    """
    if not is_ready():
        return None

    model, model_key = get_model()
    if model is None:
        return {"error": "No usable model found."}

    if not _model_matches_schema(model):
        return {
            "error": (
                f"{FILES[model_key]} was trained on a different set of columns "
                f"than the current Scaler/Categorical_Encoders. Retrain and "
                f"re-save it against the current dataset schema, or drop in "
                f"Best_RandomForest.pkl (or another compatible model) instead."
            )
        }

    try:
        single_df = pd.DataFrame([row])
        feature_columns, numerical_columns, categorical_columns = _resolve_feature_lists(row, model)
        single = _prepare_features_batch(single_df, feature_columns, numerical_columns, categorical_columns)
        single = _add_cluster_column_batch(single, model, numerical_columns)

        target_encoder = get_target_encoder()
        prediction = model.predict(single)
        label = target_encoder.inverse_transform(prediction)[0]

        probabilities = None
        confidence = None
        if hasattr(model, "predict_proba"):
            proba = model.predict_proba(single)[0]
            classes = target_encoder.inverse_transform(np.arange(len(proba)))
            probabilities = {str(c): round(float(p) * 100, 1) for c, p in zip(classes, proba)}
            confidence = round(float(max(proba)) * 100, 1)

        return {
            "label": str(label),
            "confidence": confidence,
            "probabilities": probabilities,
            "model_used": FILES[model_key],
        }
    except Exception as exc:
        return {"error": str(exc)}


def get_feature_importance(top_n=10):
    """Returns [(feature_name, importance), ...] for tree-based models."""
    if not is_ready():
        return None
    model, _ = get_model()
    if model is None or not hasattr(model, "feature_importances_"):
        return None
    try:
        importances = model.feature_importances_
        names = getattr(model, "feature_names_in_", None)
        if names is None:
            names = [f"Feature {i}" for i in range(len(importances))]
        pairs = sorted(zip(names, importances), key=lambda p: p[1], reverse=True)
        return [(str(n), round(float(v), 4)) for n, v in pairs[:top_n]]
    except Exception:
        return None


# --------------------------------------------------------------------------
# SHAP explanations - powers the "Explanation" button / Key Factors bars
# --------------------------------------------------------------------------

# Feature groupings used for the 3 "Key Factors" bars shown on the
# student insights page (GPA / Attendance / LMS Engagement).
FACTOR_GROUPS = {
    "GPA": ["Previous_GPA", "Midterm_GPA", "Quiz_Average", "Assignment_Average",
            "Laboratory_Average", "Final_Exam"],
    "Attendance": ["Attendance_Rate", "Absences", "Late_Count"],
    "LMS Engagement": ["LMS_Login_Count", "LMS_Time_Spent", "Modules_Viewed",
                        "Videos_Watched", "Discussion_Posts", "Assignment_Submissions"],
}

FEATURE_LABELS = {
    "Previous_GPA": "Previous GPA", "Midterm_GPA": "Midterm GPA",
    "Quiz_Average": "Quiz Average", "Assignment_Average": "Assignment Average",
    "Laboratory_Average": "Laboratory Average", "Final_Exam": "Final Exam",
    "Attendance_Rate": "Attendance Rate", "Absences": "Absences", "Late_Count": "Late Count",
    "LMS_Login_Count": "LMS Login Count", "LMS_Time_Spent": "LMS Time Spent",
    "Modules_Viewed": "Modules Viewed", "Videos_Watched": "Videos Watched",
    "Discussion_Posts": "Discussion Posts", "Assignment_Submissions": "Assignment Submissions",
    "Study_Hours_Per_Week": "Study Hours per Week", "Sleep_Hours": "Sleep Hours",
    "Motivation": "Motivation", "Time_Management": "Time Management",
    "Stress_Level": "Stress Level", "Self_Discipline": "Self-Discipline",
    "Student_ID": "Student ID",
}


def _get_cached_explainer(model, model_key):
    """
    shap.TreeExplainer(model) does real work at construction time
    (walking the whole tree ensemble) - rebuilding it on every single
    request was the main cost of the Explanation page. Cache one per
    loaded model, invalidated together with the model cache on reload.
    """
    if model_key in _explainer_cache:
        return _explainer_cache[model_key]
    import shap
    explainer = shap.TreeExplainer(model)
    _explainer_cache[model_key] = explainer
    return explainer


def explain_student(row: pd.Series, top_n=6):
    """
    Runs a (cached) SHAP TreeExplainer against the currently active
    model for a single student. Returns None if the model isn't ready,
    isn't tree-based, or SHAP isn't installed - callers should fall
    back to a simple heuristic in that case.

    Returns:
        {
            "groups": {"GPA": pct, "Attendance": pct, "LMS Engagement": pct},  # 0-100
            "top_features": [
                {"feature": "Attendance_Rate", "label": "Attendance Rate",
                 "shap": float, "direction": "increases_risk"|"decreases_risk",
                 "raw_value": ...},
                ...
            ],
        }
    """
    if not is_ready():
        return None

    model, model_key = get_model()
    if model is None or not _model_matches_schema(model):
        return None

    try:
        import shap  # noqa: F401 - import check; _get_cached_explainer does the real import
    except ImportError:
        return None

    single_df = pd.DataFrame([row])
    feature_columns, numerical_columns, categorical_columns = _resolve_feature_lists(row, model)
    single = _prepare_features_batch(single_df, feature_columns, numerical_columns, categorical_columns)
    single = _add_cluster_column_batch(single, model, numerical_columns)

    try:
        explainer = _get_cached_explainer(model, model_key)
        raw_shap = explainer.shap_values(single)
    except Exception:
        return None

    target_encoder = get_target_encoder()
    classes = list(target_encoder.classes_)
    at_risk_idx = classes.index("At Risk") if "At Risk" in classes else 0

    try:
        if isinstance(raw_shap, list):
            vals = np.asarray(raw_shap[at_risk_idx])[0]
        else:
            arr = np.asarray(raw_shap)
            if arr.ndim == 3:
                vals = arr[0, :, at_risk_idx]
            elif arr.ndim == 2:
                vals = arr[0]
            else:
                vals = arr
    except Exception:
        return None

    feature_names = list(single.columns)
    contributions = dict(zip(feature_names, vals))

    # Student_ID sometimes shows real SHAP weight (a data-leakage smell
    # flagged elsewhere in this project's own README) - whatever the
    # cause, showing "Student ID: W500000 — Major factor" to a parent is
    # meaningless and confusing, so it never belongs in the human-facing
    # top-features list even though it's a legitimate model input.
    NON_EXPLANATORY_COLUMNS = {"Student_ID", "Cluster"}
    explainable_contributions = {k: v for k, v in contributions.items() if k not in NON_EXPLANATORY_COLUMNS}

    group_scores = {}
    for gname, cols in FACTOR_GROUPS.items():
        group_scores[gname] = sum(abs(contributions.get(c, 0.0)) for c in cols if c in contributions)

    max_score = max(group_scores.values()) if group_scores else 0
    group_pct = {
        g: (max(round(s / max_score * 100, 1), 4) if max_score > 0 else 4)
        for g, s in group_scores.items()
    }

    ranked = sorted(explainable_contributions.items(), key=lambda kv: abs(kv[1]), reverse=True)
    max_abs_shap = abs(ranked[0][1]) if ranked else 0

    top_features = []
    for name, val in ranked[:top_n]:
        direction = "increases_risk" if val > 0 else "decreases_risk"
        plain = plain_language.describe_feature(name, row.get(name), direction, val, max_abs_shap)
        top_features.append({
            "feature": name,
            "label": FEATURE_LABELS.get(name, name.replace("_", " ")),
            "shap": round(float(val), 4),
            "direction": direction,
            "raw_value": row.get(name),
            "plain": plain,
        })

    return {"groups": group_pct, "top_features": top_features}

