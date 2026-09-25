-- ============================================================
-- AURA database schema (MySQL / MariaDB / XAMPP)
-- Run this once in phpMyAdmin (Import tab) against a database
-- named aura_db, or via the mysql CLI:
--   mysql -u root aura_db < schema.sql
--
-- Deploying to a cloud MySQL instead of XAMPP? This same file
-- works unchanged - just run it against that database instead.
-- Deploying to Postgres (e.g. for Vercel + a cloud Postgres)?
-- Use schema_postgres.sql instead.
-- ============================================================

CREATE DATABASE IF NOT EXISTS aura_db;
USE aura_db;

-- ------------------------------------------------------------
-- Users (login / signup)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    full_name VARCHAR(150) NOT NULL,
    email VARCHAR(150) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(30) NOT NULL DEFAULT 'teacher',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ------------------------------------------------------------
-- Upload history (every file a teacher has uploaded)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS uploads (
    id INT AUTO_INCREMENT PRIMARY KEY,
    filename VARCHAR(255) NOT NULL,
    file_type VARCHAR(10) NOT NULL,
    row_count INT NOT NULL DEFAULT 0,
    uploaded_by INT NULL,
    is_active BOOLEAN NOT NULL DEFAULT FALSE,
    clean_report JSON NULL,
    uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_uploads_owner (uploaded_by),
    CONSTRAINT fk_uploads_user FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ------------------------------------------------------------
-- Students. Each row belongs to one upload (upload_id), and each
-- upload belongs to one teacher (uploads.uploaded_by) - that chain
-- is how "a teacher can only see/edit what they uploaded" is
-- enforced. Re-uploading only replaces THAT teacher's own rows
-- (see data_service.save_dataset) - other teachers' students are
-- untouched.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS students (
    id INT AUTO_INCREMENT PRIMARY KEY,
    upload_id INT NULL,
    Student_ID VARCHAR(50) NOT NULL,
    Age INT NULL,
    Sex VARCHAR(20) NULL,
    Program VARCHAR(20) NULL,
    Year_Level INT NULL,
    Scholarship_Status VARCHAR(10) NULL,
    Employment_Status VARCHAR(20) NULL,
    Previous_GPA FLOAT NULL,
    Midterm_GPA FLOAT NULL,
    Quiz_Average FLOAT NULL,
    Assignment_Average FLOAT NULL,
    Laboratory_Average FLOAT NULL,
    Final_Exam FLOAT NULL,
    Failed_Subjects INT NULL,
    Retaken_Subjects INT NULL,
    Attendance_Rate FLOAT NULL,
    Absences INT NULL,
    Late_Count INT NULL,
    LMS_Login_Count INT NULL,
    LMS_Time_Spent FLOAT NULL,
    Modules_Viewed FLOAT NULL,
    Videos_Watched FLOAT NULL,
    Discussion_Posts INT NULL,
    Assignment_Submissions FLOAT NULL,
    Study_Hours_Per_Week FLOAT NULL,
    Sleep_Hours FLOAT NULL,
    Motivation INT NULL,
    Time_Management INT NULL,
    Stress_Level INT NULL,
    Self_Discipline INT NULL,
    Family_Income VARCHAR(20) NULL,
    Internet_Quality VARCHAR(20) NULL,
    Device_Availability VARCHAR(20) NULL,
    Parent_Education VARCHAR(30) NULL,
    Counseling_Attendance INT NULL,
    Organization_Participation VARCHAR(10) NULL,
    Extra_Curricular VARCHAR(10) NULL,
    Peer_Interaction INT NULL,
    Performance VARCHAR(20) NULL,
    Predicted_Performance VARCHAR(20) NULL,
    Prediction_Confidence FLOAT NULL,
    INDEX idx_student_id (Student_ID),
    INDEX idx_students_upload (upload_id),
    CONSTRAINT fk_students_upload FOREIGN KEY (upload_id) REFERENCES uploads(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ------------------------------------------------------------
-- Intervention log - the AUF Early Intervention Policy checklist,
-- tracked PER STUDENT_ID (not a foreign key to students.id, since
-- a teacher's students rows get replaced on re-upload) - this table
-- is deliberately independent so a teacher's tracked progress on a
-- student survives a dataset re-upload, as long as the same
-- Student_ID reappears.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS intervention_log (
    id INT AUTO_INCREMENT PRIMARY KEY,
    student_id VARCHAR(50) NOT NULL,
    stage TINYINT NOT NULL,
    action_key VARCHAR(100) NOT NULL,
    completed BOOLEAN NOT NULL DEFAULT FALSE,
    completed_at DATETIME NULL,
    completed_by INT NULL,
    notes TEXT NULL,
    UNIQUE KEY uniq_student_action (student_id, action_key),
    INDEX idx_intervention_student (student_id),
    CONSTRAINT fk_intervention_user FOREIGN KEY (completed_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ------------------------------------------------------------
-- Action plan - the Teacher Action Plan / reminders & scheduling
-- feature. Each item belongs to one teacher (created_by) and
-- optionally references one student. status is one of:
-- 'Pending', 'Scheduled', 'Ongoing', 'Finished'.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS action_plans (
    id INT AUTO_INCREMENT PRIMARY KEY,
    created_by INT NOT NULL,
    student_id VARCHAR(50) NULL,
    title VARCHAR(255) NOT NULL,
    notes TEXT NULL,
    priority VARCHAR(10) NOT NULL DEFAULT 'Medium',
    due_date DATE NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'Pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_action_plans_owner (created_by),
    CONSTRAINT fk_action_plans_user FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
