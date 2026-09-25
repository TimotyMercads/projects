"""
plain_language.py
------------------
Turns a technical SHAP explanation into something a teacher can read
aloud to a parent who has never heard of "SHAP," "confidence scores," or
machine learning at all.

Three things happen here that the raw SHAP output does NOT give you:
  1. Every feature gets a plain English name and a natural way to state
     its value (percentages, hours, "times per week" - not bare numbers).
  2. Every feature gets a short, warm sentence explaining what a
     high/low value generally means for a student - not "this variable
     correlates with the target," but "regularly attending class is one
     of the strongest predictors of finishing the term strong."
  3. The SHAP magnitude (a decimal like 0.0523, meaningless to a
     non-technical reader) becomes a simple 3-level "how much this
     matters" rating instead - Major / Moderate / Minor - shown as a
     visual bar, not a number.

Nothing here changes the underlying prediction or SHAP math (that's
still in model_service.py) - this only changes how it's DESCRIBED.
"""

# Each entry: plain_name (what to call it), unit/format for the value,
# and two short phrases - one for when this factor is working AGAINST
# a strong outcome (risk_note) and one for when it's working FOR one
# (support_note). Written the way a teacher would actually explain it
# in a parent-teacher conference, not a data dictionary.
FEATURE_INFO = {
    "Attendance_Rate": {
        "plain_name": "Attendance",
        "format": lambda v: f"{v:.0f}%",
        "risk_note": "Missing class regularly makes it much harder to keep up with new material - this is one of the most reliable warning signs.",
        "support_note": "Showing up consistently gives them the best chance to catch everything taught in class.",
    },
    "Absences": {
        "plain_name": "Days Absent",
        "format": lambda v: f"{v:.0f} day(s)",
        "risk_note": "A higher number of absences means more missed lessons and instructions to catch up on.",
        "support_note": "A low absence count means they've had the chance to be present for most of the material.",
    },
    "Late_Count": {
        "plain_name": "Times Late",
        "format": lambda v: f"{v:.0f} time(s)",
        "risk_note": "Frequent lateness often means missing the start of class, where instructions and context are usually given.",
        "support_note": "Rarely being late suggests good routine and preparation habits.",
    },
    "Previous_GPA": {
        "plain_name": "Previous Term's GPA",
        "format": lambda v: f"{v:.2f}",
        "risk_note": "A weaker GPA last term suggests some foundational gaps that may still be affecting them now.",
        "support_note": "A strong GPA last term shows a solid academic foundation coming into this one.",
    },
    "Midterm_GPA": {
        "plain_name": "Midterm GPA",
        "format": lambda v: f"{v:.2f}",
        "risk_note": "A weaker midterm grade is one of the clearest signs that extra support is needed before finals.",
        "support_note": "A strong midterm grade shows they're on track so far this term.",
    },
    "Quiz_Average": {
        "plain_name": "Quiz Average",
        "format": lambda v: f"{v:.0f}%",
        "risk_note": "Lower quiz scores often mean the day-to-day material isn't fully sinking in yet.",
        "support_note": "Solid quiz scores show they're keeping up with material week to week.",
    },
    "Assignment_Average": {
        "plain_name": "Assignment Average",
        "format": lambda v: f"{v:.0f}%",
        "risk_note": "Lower assignment scores can point to rushed work, missed instructions, or needing more time to complete tasks.",
        "support_note": "Strong assignment scores show consistent effort on take-home work.",
    },
    "Laboratory_Average": {
        "plain_name": "Laboratory Average",
        "format": lambda v: f"{v:.0f}%",
        "risk_note": "Lower lab scores may mean hands-on or applied work is an area needing more practice.",
        "support_note": "Strong lab scores show they're comfortable applying what they've learned.",
    },
    "Final_Exam": {
        "plain_name": "Final Exam Score",
        "format": lambda v: f"{v:.0f}%",
        "risk_note": "A lower final exam score is one of the strongest signals used in this prediction.",
        "support_note": "A strong final exam score is one of the clearest positive signals used in this prediction.",
    },
    "Failed_Subjects": {
        "plain_name": "Failed Subjects",
        "format": lambda v: f"{v:.0f}",
        "risk_note": "Having failed subject(s) already is a strong signal that this term needs closer attention.",
        "support_note": "Not having any failed subjects is a good sign of overall academic standing.",
    },
    "Retaken_Subjects": {
        "plain_name": "Retaken Subjects",
        "format": lambda v: f"{v:.0f}",
        "risk_note": "Retaking subject(s) can add extra workload and pressure on top of the current term.",
        "support_note": "Not needing to retake any subjects keeps their course load more manageable.",
    },
    "Study_Hours_Per_Week": {
        "plain_name": "Study Time",
        "format": lambda v: f"{v:.1f} hrs/week",
        "risk_note": "Less time spent studying outside of class is strongly linked to falling behind.",
        "support_note": "A healthy amount of independent study time outside class is paying off.",
    },
    "Sleep_Hours": {
        "plain_name": "Sleep",
        "format": lambda v: f"{v:.1f} hrs/night",
        "risk_note": "Not getting enough sleep can affect focus, memory, and energy for learning.",
        "support_note": "Getting enough rest supports better focus and energy for learning.",
    },
    "Stress_Level": {
        "plain_name": "Stress Level",
        "format": lambda v: f"{v:.0f}/5",
        "risk_note": "Higher reported stress can make it harder to concentrate and stay on top of schoolwork.",
        "support_note": "Lower reported stress supports better focus and consistency.",
    },
    "Motivation": {
        "plain_name": "Motivation",
        "format": lambda v: f"{v:.0f}/5",
        "risk_note": "Lower self-reported motivation is often an early sign worth checking in about.",
        "support_note": "Higher self-reported motivation is a positive sign for staying on track.",
    },
    "Time_Management": {
        "plain_name": "Time Management",
        "format": lambda v: f"{v:.0f}/5",
        "risk_note": "Weaker time management skills can lead to rushed or missed work.",
        "support_note": "Good time management helps keep work organized and submitted on time.",
    },
    "Self_Discipline": {
        "plain_name": "Self-Discipline",
        "format": lambda v: f"{v:.0f}/5",
        "risk_note": "Lower self-discipline scores can make independent study more difficult without extra structure.",
        "support_note": "Strong self-discipline supports consistent, independent work habits.",
    },
    "Peer_Interaction": {
        "plain_name": "Peer Interaction",
        "format": lambda v: f"{v:.0f}/5",
        "risk_note": "Less interaction with classmates can mean fewer chances for peer support or study groups.",
        "support_note": "Healthy peer interaction often comes with informal support and study partnerships.",
    },
    "Counseling_Attendance": {
        "plain_name": "Counseling Visits",
        "format": lambda v: f"{v:.0f} visit(s)",
        "risk_note": "Counseling visits can reflect challenges the student is already working through with support.",
        "support_note": "No recent counseling visits recorded.",
    },
    "LMS_Login_Count": {
        "plain_name": "Online Learning Logins",
        "format": lambda v: f"{v:.0f} times",
        "risk_note": "Logging into the online learning portal less often often means missing announcements or materials.",
        "support_note": "Frequent logins to the online learning portal show consistent engagement with the course.",
    },
    "LMS_Time_Spent": {
        "plain_name": "Time on Online Learning Portal",
        "format": lambda v: f"{v:.0f} min total",
        "risk_note": "Less time spent on the online learning portal can mean less exposure to course materials.",
        "support_note": "More time spent on the online learning portal shows active engagement with course content.",
    },
    "Modules_Viewed": {
        "plain_name": "Course Modules Viewed",
        "format": lambda v: f"{v:.0f}",
        "risk_note": "Viewing fewer course modules can mean gaps in covering the assigned material.",
        "support_note": "Viewing most or all course modules shows they're keeping up with assigned material.",
    },
    "Videos_Watched": {
        "plain_name": "Course Videos Watched",
        "format": lambda v: f"{v:.0f}",
        "risk_note": "Watching fewer course videos can mean missing supplementary explanations of the material.",
        "support_note": "Watching course videos shows they're using the available learning resources.",
    },
    "Discussion_Posts": {
        "plain_name": "Discussion Board Posts",
        "format": lambda v: f"{v:.0f} post(s)",
        "risk_note": "Less participation in class discussions can mean less practice explaining or asking about the material.",
        "support_note": "Participating in class discussions shows active engagement with the course.",
    },
    "Assignment_Submissions": {
        "plain_name": "Assignments Submitted",
        "format": lambda v: f"{v:.0f}",
        "risk_note": "Fewer completed assignment submissions directly affects the overall grade and understanding.",
        "support_note": "Consistently submitting assignments keeps their grade and understanding on track.",
    },
}

# Fallback for any dataset column not explicitly covered above (e.g. a
# custom column someone's own dataset happens to include).
def _fallback_info(feature_key):
    return {
        "plain_name": feature_key.replace("_", " ").title(),
        "format": lambda v: f"{v}",
        "risk_note": "This is one of the factors the model weighed for this student.",
        "support_note": "This is one of the factors the model weighed for this student.",
    }


def magnitude_level(shap_value, max_abs_shap):
    """
    Converts a raw SHAP number into a 3-level plain rating instead of a
    decimal nobody outside data science can interpret. Returns
    (level: 'Major'|'Moderate'|'Minor', pct: 0-100 for a visual bar).
    """
    if max_abs_shap <= 0:
        return "Minor", 10
    ratio = abs(shap_value) / max_abs_shap
    pct = max(round(ratio * 100), 8)
    if ratio >= 0.66:
        return "Major", pct
    if ratio >= 0.33:
        return "Moderate", pct
    return "Minor", pct


def describe_feature(feature_key, raw_value, direction, shap_value, max_abs_shap):
    """
    Builds one parent-and-teacher-readable explanation card's worth of
    content for a single feature - no SHAP numbers, no jargon.

    Returns:
        {
            "plain_name": "Attendance",
            "formatted_value": "63%",
            "note": "Missing class regularly makes it much harder to ...",
            "level": "Major" | "Moderate" | "Minor",
            "level_pct": 0-100,           # for a visual bar, not a number readout
            "direction": "risk" | "support",
        }
    """
    info = FEATURE_INFO.get(feature_key) or _fallback_info(feature_key)

    try:
        formatted_value = info["format"](float(raw_value)) if raw_value not in (None, "") else "—"
    except (TypeError, ValueError):
        formatted_value = str(raw_value) if raw_value not in (None, "") else "—"

    is_risk = direction == "increases_risk"
    note = info["risk_note"] if is_risk else info["support_note"]
    level, level_pct = magnitude_level(shap_value, max_abs_shap)

    return {
        "plain_name": info["plain_name"],
        "formatted_value": formatted_value,
        "note": note,
        "level": level,
        "level_pct": level_pct,
        "direction": "risk" if is_risk else "support",
    }
