"""
intervention_policy.py
-----------------------
Encodes Angeles University Foundation's approved policy:
"Early Intervention and Academic Support for Students at Risk"
(Office of the VP for Academic Affairs, implemented January 25, 2024).

This is real institutional policy content, not a generic placeholder -
every step and checklist item below is taken directly from the approved
policy document and its appendices. Nothing here is invented.

The policy defines three stages:

  STAGE 1 - When a student fails/misses the first two quizzes or
            requirements during the midterm period.
  STAGE 2 - When a student obtains a Midterm grade other than "Passed".
  STAGE 3 - When a student obtains a Final grade other than "Passed".

Appendix C's monitoring checklist is reproduced as ACTION items so a
teacher can track exactly which interventions have been carried out per
student, matching how Program Chairs/Deans are expected to document
compliance in the real policy.

NOTE ON STAGE DETECTION: the source policy triggers stages from actual
quiz/requirement failures and official midterm/final grades, which this
synthetic dataset does not directly contain (it has composite averages
instead). determine_stage() below maps the closest available signals to
each stage as a reasonable heuristic - it is disclosed as such everywhere
it's used, not presented as if it were the literal policy trigger.
"""

STAGE_1 = {
    "number": 1,
    "title": "Stage 1 — Missed First Two Quizzes/Requirements (Midterm Period)",
    "trigger": "Student fails or misses the first two consecutive quizzes/requirements in a subject.",
    "steps": [
        {
            "title": "Identify",
            "detail": "The teacher identifies the student as \"at risk\" in that subject.",
        },
        {
            "title": "Notify",
            "detail": (
                "The teacher promptly informs the student (via MyClass Inbox) about the "
                "failed or missed quizzes and requires the student to submit an Academic "
                "Self-Reflection Report (ASR) in PDF."
            ),
        },
        {
            "title": "Respond",
            "detail": (
                "Depending on the content of the ASR, the teacher schedules a meeting or "
                "initiates further communication with the student (email, virtual meeting, "
                "or in person)."
            ),
        },
        {
            "title": "Engage",
            "detail": (
                "The teacher offers guidance: relevant resources on study techniques, "
                "self-regulation, and test-taking skills; and/or peer-facilitated mentoring "
                "or referral to peer tutoring services within the college."
            ),
        },
        {
            "title": "Refer (if needed)",
            "detail": (
                "If challenges extend beyond academics, the teacher refers the student to the "
                "Guidance and Counseling Center (GCC) via a formal email (Program Chair cc'd), "
                "attaching the student's completed ASR."
            ),
        },
    ],
    "actions": [
        ("informed_failed_quizzes", "Informed the student about the failed quizzes/missed requirements"),
        ("required_asr", "Required the student to submit an Academic Self-Reflection Report (ASR)"),
        ("followup_after_asr", "Initiated further communication with the student after ASR submission and offered relevant resources"),
        ("scheduled_remedial", "Scheduled remedial/tutorial classes for at-risk students"),
        ("peer_mentoring", "Designed and implemented a peer-facilitated mentoring activity in class"),
        ("referred_peer_tutoring", "Referred student to peer tutoring services offered within the college"),
        ("referred_gcc", "Referred student to the Guidance and Counseling Center (GCC)"),
        ("maintained_records", "Maintained thorough records of all communications, meetings, and interventions"),
        ("ensured_confidentiality", "Ensured that all information regarding the at-risk student is kept confidential"),
    ],
}

STAGE_2 = {
    "number": 2,
    "title": "Stage 2 — Midterm Grade Other Than \"Passed\"",
    "trigger": "Student obtains any grade other than \"Passed\" in the Midterm period.",
    "steps": [
        {
            "title": "Post-Intervention Assessment",
            "detail": (
                "The teacher schedules a Student Performance Debrief to discuss and evaluate "
                "initial intervention strategies and identify new challenges. If the student "
                "was not previously flagged at-risk, a debrief is still conducted and an ASR "
                "is formally required afterward."
            ),
        },
        {
            "title": "Initial Parent Engagement",
            "detail": (
                "Parents/guardians may be informed of the student's midterm academic "
                "performance, per the Unit/College's criteria for parent notification "
                "(e.g. failing 30% or more of total units). The Program Chair sends a formal "
                "notification email (Dean cc'd) and requires prompt parent feedback."
            ),
        },
        {
            "title": "Parent-Teacher/Chair Meeting",
            "detail": (
                "Depending on the parent's response, the Program Chair arranges a "
                "parent-teacher meeting (virtual or in-person) to discuss the student's "
                "challenges and ongoing support plan."
            ),
        },
        {
            "title": "Continuous Monitoring",
            "detail": (
                "The teacher and Program Chair maintain ongoing communication with the "
                "student and parents, continuously monitoring progress and adjusting support "
                "as needed — remedial classes or peer tutoring may continue."
            ),
        },
    ],
    "actions": [
        ("performance_debrief", "Conducted Student Performance Debrief after release of Midterm Grades"),
        ("updated_parent", "Updated the parent or guardian about the student's academic performance"),
        ("parent_teacher_meeting", "Arranged/attended a parent-teacher meeting"),
        ("maintained_records", "Maintained thorough records of all communications, meetings, and interventions"),
        ("ensured_confidentiality", "Ensured that all information regarding the at-risk student is kept confidential"),
    ],
}

STAGE_3 = {
    "number": 3,
    "title": "Stage 3 — Final Grade Other Than \"Passed\"",
    "trigger": "Student obtains a Final grade other than \"Passed\".",
    "steps": [
        {
            "title": "Retention Policies / Alternative Career Options",
            "detail": (
                "If academic challenges persist and the current course or program appears "
                "unsuitable for the student, the Program Chair notifies the student and "
                "parents to reiterate retention policies and discuss alternative academic or "
                "career options."
            ),
        },
    ],
    "actions": [
        ("notified_retention_policy", "Notified student and parents of retention policy / alternative options"),
        ("maintained_records", "Maintained thorough records of all communications, meetings, and interventions"),
        ("ensured_confidentiality", "Ensured that all information regarding the at-risk student is kept confidential"),
    ],
}

STAGES = {1: STAGE_1, 2: STAGE_2, 3: STAGE_3}

# General reminders that apply across every stage (from the policy's
# "Other Reminders" section).
POLICY_REMINDERS = [
    "Documentation: maintain thorough records of all communications, meetings, and interventions for tracking and documentation purposes.",
    "Confidentiality: information regarding at-risk students is shared only with relevant school personnel and the student's parents or guardians.",
]

# Enrichment suggestions for High Performing students. The AUF policy is
# specifically an AT-RISK intervention policy and does not cover
# high-performing students, so this list is our own general guidance,
# not part of the approved policy - kept clearly separate everywhere
# it's displayed.
HIGH_PERFORMING_SUGGESTIONS = [
    "Offer enrichment activities or advanced coursework opportunities.",
    "Recommend the student for a peer mentoring / tutoring role.",
    "Recognize achievement (e.g. Dean's List consideration, public recognition).",
    "Encourage participation in academic organizations or competitions.",
]


def determine_stage(row, prediction_label=None):
    """
    Heuristically maps a student's data to the closest matching policy
    stage. Returns None if the student doesn't appear to be on an
    at-risk track at all (i.e. no signal suggests Stage 1-3 applies).

    This is a heuristic derived from the columns this dataset actually
    has (composite averages, midterm/final scores) - not a literal
    implementation of the policy's real triggers (specific quiz/
    requirement failures, official registrar grades), which this
    synthetic dataset doesn't contain. Always disclosed as such in the UI.
    """
    label = prediction_label or row.get("Performance")
    if label != "At Risk":
        return None

    final_exam = row.get("Final_Exam")
    midterm_gpa = row.get("Midterm_GPA")

    # Stage 3: a final-level failure signal takes priority - the student
    # is furthest along the at-risk timeline.
    if final_exam is not None and _safe_float(final_exam) is not None and _safe_float(final_exam) < 60:
        return 3

    # Stage 2: PH grading convention - a GPA above 3.0 indicates a
    # non-passing midterm grade.
    if midterm_gpa is not None and _safe_float(midterm_gpa) is not None and _safe_float(midterm_gpa) > 3.0:
        return 2

    # Stage 1: flagged at-risk but no stronger midterm/final signal yet -
    # treated as an early warning.
    return 1


def _safe_float(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None
