-- ============================================================
-- AURA database schema (PostgreSQL)
-- Use this instead of schema.sql when your database is Postgres
-- (e.g. a cloud Postgres add-on used alongside a Vercel deployment
-- - Neon, Supabase, Railway, Render Postgres, etc).
--
-- Run it once against your database, e.g.:
--   psql "$DATABASE_URL" -f schema_postgres.sql
-- or paste it into your host's SQL console (most cloud Postgres
-- dashboards have one).
--
-- IMPORTANT: every column name below is double-quoted ("Student_ID",
-- not Student_ID). Postgres silently lowercases unquoted identifiers,
-- but the app's Python code and every dataset column (Student_ID,
-- Attendance_Rate, etc.) uses the exact mixed case from the original
-- CSV/notebook schema - quoting preserves that so inserts/selects
-- actually match. Don't remove the quotes when editing this file.
--
-- This does NOT include "CREATE DATABASE" - most managed Postgres
-- hosts give you an already-created database and only let you
-- connect to that one, so just run this against it directly.
-- ============================================================

-- ------------------------------------------------------------
-- Users (login / signup)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    full_name VARCHAR(150) NOT NULL,
    email VARCHAR(150) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(30) NOT NULL DEFAULT 'teacher',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ------------------------------------------------------------
-- Upload history (every file a teacher has uploaded)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS uploads (
    id SERIAL PRIMARY KEY,
    filename VARCHAR(255) NOT NULL,
    file_type VARCHAR(10) NOT NULL,
    row_count INT NOT NULL DEFAULT 0,
    uploaded_by INT NULL REFERENCES users(id) ON DELETE SET NULL,
    is_active BOOLEAN NOT NULL DEFAULT FALSE,
    clean_report JSON NULL,
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_uploads_owner ON uploads (uploaded_by);

-- ------------------------------------------------------------
-- Students. Each row belongs to one upload (upload_id), and each
-- upload belongs to one teacher (uploads.uploaded_by) - that chain
-- is how "a teacher can only see/edit what they uploaded" is
-- enforced. Re-uploading only replaces THAT teacher's own rows
-- (see data_service.save_dataset) - other teachers' students are
-- untouched.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS students (
    id SERIAL PRIMARY KEY,
    upload_id INT NULL REFERENCES uploads(id) ON DELETE SET NULL,
    "Student_ID" VARCHAR(50) NOT NULL,
    "Age" INT NULL,
    "Sex" VARCHAR(20) NULL,
    "Program" VARCHAR(20) NULL,
    "Year_Level" INT NULL,
    "Scholarship_Status" VARCHAR(10) NULL,
    "Employment_Status" VARCHAR(20) NULL,
    "Previous_GPA" FLOAT NULL,
    "Midterm_GPA" FLOAT NULL,
    "Quiz_Average" FLOAT NULL,
    "Assignment_Average" FLOAT NULL,
    "Laboratory_Average" FLOAT NULL,
    "Final_Exam" FLOAT NULL,
    "Failed_Subjects" INT NULL,
    "Retaken_Subjects" INT NULL,
    "Attendance_Rate" FLOAT NULL,
    "Absences" INT NULL,
    "Late_Count" INT NULL,
    "LMS_Login_Count" INT NULL,
    "LMS_Time_Spent" FLOAT NULL,
    "Modules_Viewed" FLOAT NULL,
    "Videos_Watched" FLOAT NULL,
    "Discussion_Posts" INT NULL,
    "Assignment_Submissions" FLOAT NULL,
    "Study_Hours_Per_Week" FLOAT NULL,
    "Sleep_Hours" FLOAT NULL,
    "Motivation" INT NULL,
    "Time_Management" INT NULL,
    "Stress_Level" INT NULL,
    "Self_Discipline" INT NULL,
    "Family_Income" VARCHAR(20) NULL,
    "Internet_Quality" VARCHAR(20) NULL,
    "Device_Availability" VARCHAR(20) NULL,
    "Parent_Education" VARCHAR(30) NULL,
    "Counseling_Attendance" INT NULL,
    "Organization_Participation" VARCHAR(10) NULL,
    "Extra_Curricular" VARCHAR(10) NULL,
    "Peer_Interaction" INT NULL,
    "Performance" VARCHAR(20) NULL,
    "Predicted_Performance" VARCHAR(20) NULL,
    "Prediction_Confidence" FLOAT NULL
);

CREATE INDEX IF NOT EXISTS idx_student_id ON students ("Student_ID");
CREATE INDEX IF NOT EXISTS idx_students_upload ON students (upload_id);

-- ------------------------------------------------------------
-- Intervention log - the AUF Early Intervention Policy checklist,
-- tracked PER STUDENT_ID (not a foreign key to students.id, since
-- a teacher's students rows get replaced on re-upload) - this table
-- is deliberately independent so a teacher's tracked progress on a
-- student survives a dataset re-upload, as long as the same
-- Student_ID reappears.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS intervention_log (
    id SERIAL PRIMARY KEY,
    student_id VARCHAR(50) NOT NULL,
    stage SMALLINT NOT NULL,
    action_key VARCHAR(100) NOT NULL,
    completed BOOLEAN NOT NULL DEFAULT FALSE,
    completed_at TIMESTAMP NULL,
    completed_by INT NULL REFERENCES users(id) ON DELETE SET NULL,
    notes TEXT NULL,
    CONSTRAINT uniq_student_action UNIQUE (student_id, action_key)
);

CREATE INDEX IF NOT EXISTS idx_intervention_student ON intervention_log (student_id);

-- ------------------------------------------------------------
-- Action plan - the Teacher Action Plan / reminders & scheduling
-- feature. Each item belongs to one teacher (created_by) and
-- optionally references one student. status is one of:
-- 'Pending', 'Scheduled', 'Ongoing', 'Finished'.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS action_plans (
    id SERIAL PRIMARY KEY,
    created_by INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    student_id VARCHAR(50) NULL,
    title VARCHAR(255) NOT NULL,
    notes TEXT NULL,
    priority VARCHAR(10) NOT NULL DEFAULT 'Medium',
    due_date DATE NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'Pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_action_plans_owner ON action_plans (created_by);
