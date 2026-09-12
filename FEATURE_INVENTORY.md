# School Management ERP — Complete Feature Inventory

> **Document Version**: 2.0  
> **Last Updated**: September 2026  
> **Purpose**: Definitive source of truth for ERP functionality, access permissions, data schemas, testing reference, and Help & Support documentation.

---

## Table of Contents
1. [Core Platform & Dashboard (`js/app.js`)](#1-core-platform--dashboard-jsappjs)
2. [Student Management (`js/students.js`)](#2-student-management-jsstudentsjs)
3. [Teacher Management (`js/teachers.js`)](#3-teacher-management-jsteachersjs)
4. [Student Attendance Tracking (`js/attendance.js`)](#4-student-attendance-tracking-jsattendancejs)
5. [Staff Attendance & Geofencing (`js/teacher-attendance.js`)](#5-staff-attendance--geofencing-jsteacher-attendancejs)
6. [Fee Ledger & Financial Collections (`js/fees.js`)](#6-fee-ledger--financial-collections-jsfeesjs)
7. [Exams & Report Card Designer (`js/exams.js`)](#7-exams--report-card-designer-jsexamsjs)
8. [Timetable Generator & Personal Schedule (`js/timetable.js`)](#8-timetable-generator--personal-schedule-jstimetablejs)
9. [Admin Panel, Notices & Settings (`js/admin.js`)](#9-admin-panel-notices--settings-jsadminjs)
10. [Help & Support Center (`js/help.js`)](#10-help--support-center-jshelpjs)
11. [AI Chatbot Assistant (`js/chatbot.js`)](#11-ai-chatbot-assistant-jschatbotjs)
12. [Super Admin Multi-Tenant Portal (`js/super-admin.js`)](#12-super-admin-multi-tenant-portal-jssuper-adminjs)

---

## 1. Core Platform & Dashboard (`js/app.js`)
* **Access Level**: Admin, Teacher
* **Firestore Data**: Reads/Writes `tenant_data/{schoolId}` root document (`students`, `teachers`, `attendance`, `fees`, `notices`, `settings`).

### Sub-Features & Actions:
- **Role-Based Navigation**: Dynamically renders sidebar items based on logged-in user role (`Admin` sees full ERP, `Teacher` sees assigned classes, attendance, personal schedule, notices).
- **Dashboard Summary Cards**:
  - Total Active Students count.
  - Total Active Teachers count.
  - Today's Student Attendance Percentage.
  - MTD Fee Collection Summary.
- **Quick Action Shortcuts**:
  - `[ + Add Student ]` -> Launches student creation modal.
  - `[ 📋 Mark Attendance ]` -> Navigates directly to Attendance Mark tab.
  - `[ 💳 Record Fee ]` -> Launches payment collection modal.
  - `[ 📢 Publish Notice ]` -> Launches announcement publisher modal.
  - `[ 🎓 Generate Report Card ]` -> Navigates to Exam Marks tab.
- **Notice Board Widget**:
  - Renders active announcements filtered by role (`isNoticeVisibleForUser`: Admin sees all, Teacher sees `Everyone` + `Teachers Only`).
  - Displays audience badges (`👥 Everyone`, `👨‍🏫 Teachers`, `🎓 Students`).
- **Recent Activities Audit Trail**: Chronological feed of recent ERP events (attendance marked, payments collected, notices published).
- **Global Search Bar (`Ctrl + K`)**: Instant client-side search across students, teachers, and class sections.
- **Notification Bell Dropdown**: Topbar dropdown showing unread role-filtered announcements.
- **User Profile & Password Modal**: View current credentials and change account password.

---

## 2. Student Management (`js/students.js`)
* **Access Level**: Admin (Full CRUD), Teacher (Read-only for assigned classes)
* **Firestore Data**: `tenant_data/{schoolId}.students`, `trash`

### Sub-Features & Actions:
- **Student Directory Table**:
  - Search by Name, Roll Number, Admission Number, or Parent Phone.
  - Filter by Class and Section.
  - Status toggle filter (`Active`, `Inactive`, `Archived`).
  - Responsive table layout with action buttons per row.
- **Add / Edit Student Modal**:
  - Inputs: First Name, Last Name, Roll Number, Class, Section, Gender, DOB, Parent Name, Parent Phone, Address, Blood Group, Admission Date.
  - Validation: Mandatory phone, unique roll number within class-section.
- **Student Profile View Modal**:
  - Demographics card & Avatar initials with color coding.
  - Fee Ledger tab -> View total dues, total paid, outstanding balance.
  - Attendance history tab -> Present/Absent percentages.
  - Exam marks tab -> Historical term marks and grades.
  - Action buttons: `[ Edit Student ]`, `[ Record Fee ]`, `[ View Full Ledger ]`, `[ Move to Trash ]`.
- **Bulk Excel Operations**:
  - `[ 📥 Import Excel ]` -> Parses `.xlsx` student roster and bulk inserts new records.
  - `[ 📄 Download Template ]` -> Downloads standardized Excel template with sample row.
  - `[ 📤 Export Excel ]` -> Exports current filtered student table to Excel.
- **Soft Delete / Recycle Bin**:
  - `[ 🗑️ Delete Student ]` -> Moves record to `trash` collection with recovery metadata.

---

## 3. Teacher Management (`js/teachers.js`)
* **Access Level**: Admin Only
* **Firestore Data**: `tenant_data/{schoolId}.teachers`, `trash`

### Sub-Features & Actions:
- **Teacher Directory**:
  - Search by Teacher Name, Subject, Phone, or Username.
  - Displays assigned Class Teacher role (`Class X-A`), qualification, subject specialization, and status.
- **Add / Edit Teacher Modal**:
  - Inputs: First Name, Last Name, Phone, Email/Username, Password, Qualification, Main Subject, Assigned Class Teacher of (Class & Section dropdown).
  - Credentials generator / display.
- **Teacher Details & Profile Modal**:
  - Personal info, subject expertise, and assigned schedule.
  - Direct action button to view teacher's personal attendance/punch history.
- **Teacher Credential Reset**:
  - `[ 🔑 Reset Password ]` -> Resets teacher login password and displays credentials toast.
- **Inactivate / Delete Teacher**:
  - `[ 🗑️ Delete Teacher ]` -> Soft deletes teacher record to Recycle Bin.

---

## 4. Student Attendance Tracking (`js/attendance.js`)
* **Access Level**: Admin (All classes & history edit), Teacher (Assigned class teacher only)
* **Firestore Data**: `tenant_data/{schoolId}.attendance`, `.absenceIntimationLog`, `trash`

### Sub-Features & Actions:
- **Mark Attendance Tab**:
  - Date Picker (defaults to today).
  - Class & Section selector (Teacher restricted to `classTeacherOf`).
  - Quick Bulk Buttons: `[ 🟢 All Present ]`, `[ 🔴 All Absent ]`, `[ 🔄 Reset ]`.
  - Student Card Grid: Interactive `P` (Present), `A` (Absent), `L` (Late) toggle buttons per student.
  - Live Summary Bar: Present count, Absent count, Late count, Attendance percentage progress bar.
  - `[ 💾 Submit Attendance ]` -> Saves or updates attendance record with teacher ID and timestamp.
- **Absent Student Parent Intimation System**:
  - **Post-Submission Auto-Trigger**: Auto-opens intimation modal after saving if absent students exist (silent if 0 absent).
  - **Intimation Modal Queue UI**:
    - Lists absent students, roll numbers, and parent contact.
    - `[ 📱 WhatsApp ]` -> Opens `wa.me/91{parentPhone}?text={encodedMessage}` in a new tab, updates row badge to `✅ WhatsApp Sent`, logs event.
    - `[ 💬 SMS ]` -> Dispatches SMS via Fast2SMS API if `fast2smsApiKey` exists; disabled with tooltip `"SMS not configured"` if key is missing.
    - Status Badge: `⬜ Pending` ➔ `✅ WhatsApp Sent` / `✅ SMS Sent`.
    - `[ Close / Skip ]` -> Closes intimation modal.
  - **Manual Trigger from History**: `[ 📢 Send Absence Intimation ]` button on history rows and detail view to notify parents for past date absences manually.
- **Attendance History Tab**:
  - Filter by Date Range (From / To), Class, Section.
  - Table showing Date, Class-Sec, Teacher, Present/Absent/Late counts, Attendance %, Actions.
  - `[ 👁️ View Details ]` -> Opens student-wise attendance breakdown modal with Excel export.
  - `[ 📢 Notify Absent Parents ]` -> Triggers intimation modal for past record.
  - `[ 🗑️ Delete Record ]` -> Admin soft-delete to Recycle Bin.

---

## 5. Staff Attendance & Geofencing (`js/teacher-attendance.js`)
* **Access Level**: Both (Teacher marks own punch; Admin views all staff & overrides)
* **Firestore Data**: `tenant_data/{schoolId}.teacherAttendance`

### Sub-Features & Actions:
- **Teacher Portal — GPS Punch-In / Punch-Out**:
  - Geofence Distance Check: Calculates distance in meters from browser GPS location to school coordinates using Haversine formula.
  - Punch Status Indicator: Displays `Within Geofence (X meters)` or `Out of Geofence Bounds`.
  - `[ 📍 Punch In ]` / `[ 📍 Punch Out ]` -> Records timestamp, GPS coords, distance, and status (`On Time`, `Late`, `Half Day`).
  - Personal Punch Log: Monthly calendar/table view of logged-in teacher's punches.
- **Admin Staff Attendance Overview**:
  - Today's Staff Punch Board (Punched In, Late, Absent staff summary).
  - `[ ✏️ Manual Punch Override ]` -> Admin can manually add or fix a teacher's punch in/out record.
  - Monthly Staff Attendance Register: Grid report showing total working days, present days, late count, and half days for all staff.
  - `[ 📤 Export Staff Attendance ]` -> Exports staff attendance log to Excel.

---

## 6. Fee Ledger & Financial Collections (`js/fees.js`)
* **Access Level**: Admin Only
* **Firestore Data**: `tenant_data/{schoolId}.fees`, `.settings.feeStructure`, `.settings.extraCharges`, `trash`

### Sub-Features & Actions:
- **Fee Ledger Dashboard**:
  - Metric Cards: Today's Collection (Calculated live), MTD Collection, Cash in Hand, Total Dues.
  - Real-time Transaction Ledger Table (No mock/dummy data).
- **Collect Payment Modal**:
  - Student Selector (auto-populates outstanding dues).
  - Fee Head breakdown.
  - Payment Details: Amount (₹), Payment Mode (`Cash`, `Online / UPI`, `Cheque`, `Bank Transfer`), Date, Remarks / Ref ID.
  - `[ 💳 Record Payment ]` -> Saves transaction to Firestore.
- **Post-Payment Action Modal**:
  - Auto-triggers after payment save.
  - `[ 📄 View / Print Receipt PDF ]` -> Generates branded PDF receipt via `printViaBlob()`.
  - `[ 📱 Share on WhatsApp ]` -> Triggers WhatsApp receipt notification.
  - `[ Skip / Done ]` -> Closes modal.
- **Fee Receipt PDF Engine**:
  - `generateFeeReceiptHTML()`: Styled receipt with school logo, `primaryColor` header, Receipt No (`RCP-{schoolIdPrefix}-{timestamp}`), student details, payment breakdown, remaining balance, and cashier signature line.
- **Student Fee Ledger Modal**:
  - Full financial statement per student (Dues vs Payments).
  - `[ 📄 Print Receipt ]` icon button on every payment row.
  - `[ 📱 WhatsApp ]` icon button on every payment row.
  - `[ 🗑️ Delete Transaction ]` -> Moves payment record to Recycle Bin.
- **Fee Structure & Extra Charges Settings**:
  - Monthly Fee master setup by class.
  - One-time Extra Charges setup (Admission Fee, Annual Fee, Exam Fee, Transport Fee).
- **Auto-Charge Dues Engine**:
  - Automatically posts monthly due charges based on class fee structure.
- **Export History**:
  - `[ 📊 Export to Excel ]` -> Exports complete fee collection transactions to Excel.

---

## 7. Exams & Report Card Designer (`js/exams.js`)
* **Access Level**: Admin (Full access & designer), Teacher (Marks entry for assigned classes)
* **Firestore Data**: `tenant_data/{schoolId}.exams`, `.marks`, `.reportCardConfig`

### Sub-Features & Actions:
- **Exam Management Tab**:
  - Create & Edit Exams (e.g., `Unit Test 1`, `Half Yearly`, `Annual Examination`).
  - Set Max Marks, Passing Marks, Weightage, and Date Range per subject.
- **Marks Entry Tab**:
  - Select Class, Section, Exam, and Subject.
  - Student Marks Grid: Inputs for Obtained Marks, `Exempted` checkbox, `Absent` checkbox.
  - Auto-calculated Total Marks, Percentage, Grade, and Pass/Fail status.
  - `[ 💾 Save Marks ]` -> Persists class exam marks to Firestore.
- **Report Card Designer Tab**:
  - Layout Selector: Standard Single-Page, Modern Dual-Column, Detailed 4-Tab.
  - Branding Controls: Logo position, School Header text, Primary Color picker (`#1E3A8A`), Secondary Accent.
  - Grading Scale Setup (A1, A2, B1, B2, C1, C2, D, E).
  - Custom Remarks & Signature Lines (Class Teacher, Principal, Parent).
- **Generate & Print Report Cards**:
  - Single Student or Batch Class Print.
  - `printViaBlob()`: Renders complete HTML blob with inline CSS and triggers native print/PDF engine.
- **Tabulation Sheet Tab**:
  - Class-wise master marks matrix showing subject scores, total percentage, rank, and result status.
  - `[ 📤 Export Tabulation Sheet ]` -> Exports class exam results to Excel.

---

## 8. Timetable Generator & Personal Schedule (`js/timetable.js`)
* **Access Level**: Admin (Generator & Editor), Teacher (Read-only "My Schedule")
* **Firestore Data**: `tenant_data/{schoolId}.timetable`

### Sub-Features & Actions:
- **Auto-Timetable Generator (Admin)**:
  - Constraint-based solver: Assigns periods (Period 1 to 8), subjects, teachers, and rooms without double-booking teachers or rooms.
  - `[ ⚡ Auto-Generate Draft ]` -> Solves schedule, writes directly to `SchoolApp.store.timetable`, and auto-saves to Firestore.
  - `[ 🔄 Reset / Regenerate ]` -> Clears existing schedule draft for regeneration.
- **Interactive Timetable Grid Editor (Admin)**:
  - View schedule by Class-Section or by Teacher.
  - Cell click/edit to adjust Subject, Teacher, or Room assignment.
  - `[ 💾 Save Timetable ]` -> Persists manual adjustments.
- **Teacher Portal — "My Schedule" (Teacher)**:
  - Exposed directly in sidebar navigation for `Teacher` role.
  - Read-only day-wise personal timetable: `Period | Time Slot | Class & Section | Subject | Room`.
  - Filter by Day of Week (Monday – Saturday).

---

## 9. Admin Panel, Notices & Settings (`js/admin.js`)
* **Access Level**: Admin Only
* **Firestore Data**: `tenant_data/{schoolId}.settings`, `.notices`, `trash`

### Sub-Features & Actions:
- **Notice Board / Announcements Manager**:
  - Notice Creation Form: Title, Description/Content, Category, Date, Audience Target (`Everyone`, `Teachers Only`, `Students Only`).
  - Notice Table: Active announcements list with Audience Badges (`👥 Everyone`, `👨‍🏫 Teachers`, `🎓 Students`).
  - `[ ✏️ Edit Notice ]` / `[ 🗑️ Delete Notice ]` -> Manage or archive notices.
- **School Profile & Branding Settings**:
  - School Name, Address, Phone, Email, Tagline, Affiliation Code, UDISE Code.
  - School Logo Uploader (Base64 compression & preview).
  - Primary Theme Color Picker.
- **Academic Structure Manager**:
  - Classes & Sections setup (e.g., Class 1 to 12, Sections A, B, C).
  - Subject Master List (Mandatory & Optional subjects per class).
  - Academic Session / Financial Year dates.
- **Recovery Center / Recycle Bin**:
  - Responsive table containing soft-deleted items across ERP (`Student`, `Teacher`, `Attendance`, `Notice`).
  - Table headers: `Item`, `Type`, `Deleted Date`, `Deleted By`, `Actions`.
  - `[ 🔄 Restore ]` -> Restores item back to active dataset.
  - `[ ❌ Delete Permanently ]` -> Purges item permanently from database.

---

## 10. Help & Support Center (`js/help.js`)
* **Access Level**: Admin, Teacher
* **Firestore Data**: None (Static guide content + dynamic school contact info)

### Sub-Features & Actions:
- **Searchable Knowledge Base**:
  - Topic search bar across guides (Fees, Attendance, Report Cards, Notices, Timetable).
- **Interactive Walkthrough Cards**:
  - How to collect fees & print receipts.
  - How to mark student attendance & notify absent parents.
  - How to generate report cards.
  - How teachers view personal schedules.
- **Direct Support Contact Panel**:
  - Phone / WhatsApp support link (`+91 91555 15505`).
  - Email support link (`support@ctrlshifts.in`).
  - `[ 💬 WhatsApp Support ]` -> Opens direct WhatsApp chat with ERP support team.
- **Keyboard Shortcuts & Cheat Sheet**:
  - ERP slash commands and keybindings quick reference.

---

## 11. AI Chatbot Assistant (`js/chatbot.js`)
* **Access Level**: Admin, Teacher
* **Firestore Data**: None (Client-side assistant)

### Sub-Features & Actions:
- **Floating Assistant Widget**:
  - Bottom-right launcher icon ("Paathshala AI Helper").
  - Expandable chat modal window with message history.
- **Quick Prompt Chips**:
  - `[ 💳 How to collect fees? ]`
  - `[ 📄 How to print receipt? ]`
  - `[ 📋 How to mark attendance? ]`
  - `[ 📢 How to target notices? ]`
- **Intent Parser & Help Guide Integrator**:
  - Answers common workflow questions in plain English/Hindi.
  - Direct action links pointing to relevant ERP tabs.

---

## 12. Super Admin Multi-Tenant Portal (`js/super-admin.js`)
* **Access Level**: Super Admin Only (`super-admin.html`)
* **Firestore Data**: `schools/*`, `tenant_data/*`

### Sub-Features & Actions:
- **Multi-Tenant School Directory**:
  - List of registered schools/tenants (School ID, School Name, Admin Phone, Status, Created Date).
  - Search and filter schools.
- **Create & Initialize School Tenant**:
  - Inputs: School ID, School Name, Admin Email/Username, Password, Phone, Address.
  - **Tenant Data Initialization (Dugda School Handler)**: If a school has zero ERP data in `tenant_data/{schoolId}`, displays an intentional handled state:
    `"This school has no ERP data yet. [Initialize Default Settings]"`
    Clicking initializes default classes, subjects, fee heads, and branding.
- **School Impersonation & One-Click Switcher**:
  - `[ 🔑 Impersonate Tenant ]` -> Switches active session context to target school ERP without needing school password.
- **Feature Flags & Module Access Control**:
  - Toggle individual modules per school tenant (`Fees`, `Exams`, `Report Card Designer`, `GPS Staff Attendance`, `Timetable Generator`).
- **Subscription & System Metrics**:
  - Total Active Schools count, Total System Revenue, Storage Usage.
