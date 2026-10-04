/**
 * ===================================================
 *  AUTH UTILS — CTRL Shift ERP
 *  Secure Login & Password Hashing Manager
 * ===================================================
 */

(function () {
    'use strict';

    if (!window.AuthUtils) {
        window.AuthUtils = {};
    }

    const AuthUtils = window.AuthUtils;

    /** Helper to get bcrypt library */
    function getBcrypt() {
        if (typeof dcodeIO !== 'undefined' && dcodeIO.bcrypt) {
            return dcodeIO.bcrypt;
        }
        return null;
    }

    /**
     * Checks if a password string is already a bcrypt hash.
     * @param {string} password 
     * @returns {boolean}
     */
    AuthUtils.isHashed = function (password) {
        if (!password) return false;
        // Bcrypt hashes typically start with $2a$, $2b$, or $2y$
        return password.startsWith('$2a$') || password.startsWith('$2b$') || password.startsWith('$2y$');
    };

    /**
     * Hashes a plain-text password using bcrypt.
     * @param {string} password 
     * @returns {Promise<string>}
     */
    AuthUtils.hashPassword = async function (password) {
        const bcrypt = getBcrypt();
        if (!bcrypt) {
            console.warn('bcryptjs is not loaded. Saving plain-text password.');
            return password;
        }
        return new Promise((resolve, reject) => {
            try {
                // Use a salt round of 10
                const salt = bcrypt.genSaltSync(10);
                const hash = bcrypt.hashSync(password, salt);
                resolve(hash);
            } catch (err) {
                reject(err);
            }
        });
    };

    /**
     * Authenticates credentials and performs auto-migration of plain-text passwords.
     * @param {string} role - 'admin' | 'teacher'
     * @param {string} usernameOrEmail 
     * @param {string} password 
     * @param {object} schoolData 
     * @returns {Promise<object>} - { success: boolean, message?: string, user?: object }
     */
    AuthUtils.login = async function (role, usernameOrEmail, password, schoolData) {
        if (!schoolData || !schoolData.settings) {
            return { success: false, message: 'Database context not initialized.' };
        }

        const bcrypt = getBcrypt();

        if (role === 'admin') {
            const adminUser = schoolData.settings.adminUsername || 'admin';
            // SECURITY (H-3): Default 'admin123' fallback removed.
            // If no password is configured, login must fail — never silently grant access.
            const adminPassStored = schoolData.settings.adminPassword;
            if (!adminPassStored) {
                return { success: false, message: 'Admin password not configured. Please contact your administrator.' };
            }

            if (usernameOrEmail !== adminUser && usernameOrEmail !== 'admin') {
                return { success: false, message: 'Invalid admin username.' };
            }

            let isValid = false;
            let needsMigration = false;

            if (AuthUtils.isHashed(adminPassStored)) {
                if (bcrypt) {
                    isValid = bcrypt.compareSync(password, adminPassStored);
                } else {
                    console.error('Bcrypt is missing; cannot verify hashed admin password.');
                    return { success: false, message: 'Secure login library is offline.' };
                }
            } else {
                // Plain-text fallback check
                isValid = (password === adminPassStored);
                if (isValid) {
                    needsMigration = true;
                }
            }

            if (!isValid) {
                return { success: false, message: 'Invalid admin password.' };
            }

            // Auto-migrate to secure hash if plain text matched (ONLY if tenant is confirmed initialized)
            if (needsMigration) {
                if (!window.SchoolApp || !window.SchoolApp.tenantInitialized || !window.SchoolApp.store || !window.SchoolApp.store.currentSchoolId) {
                    console.warn('[Auth Security] Auto-migration blocked: tenant is not confirmed initialized.');
                } else {
                    try {
                        console.log('Migrating admin password to secure bcrypt hash...');
                        const hashedPass = await AuthUtils.hashPassword(password);
                        if (window.SchoolApp && window.SchoolApp.store && window.SchoolApp.store.settings) {
                            window.SchoolApp.store.settings.adminPassword = hashedPass;
                            await window.SchoolApp.save();
                            console.log('Admin password migration complete.');
                        }
                    } catch (e) {
                        console.error('Failed to auto-migrate admin password:', e);
                    }
                }
            }

            return { success: true, user: { role: 'admin', firstName: 'Admin', lastName: 'User' } };

        } else if (role === 'teacher') {
            const teachersList = schoolData.teachers || [];
            const teacher = teachersList.find(t => t.email === usernameOrEmail);

            if (!teacher) {
                return { success: false, message: 'No teacher found with this email.' };
            }

            if (teacher.status !== 'Active') {
                return { success: false, message: 'Teacher account is paused or inactive.' };
            }

            const teacherPassStored = teacher.password;
            if (!teacherPassStored || typeof teacherPassStored !== 'string' || teacherPassStored.trim() === '') {
                console.error('[Auth Security] Login rejected: teacher account has no password configured.');
                return { success: false, message: 'Account password not configured. Please contact school administrator.' };
            }
            if (!password || typeof password !== 'string' || password.trim() === '') {
                return { success: false, message: 'Password is required.' };
            }

            let isValid = false;
            let needsMigration = false;

            if (AuthUtils.isHashed(teacherPassStored)) {
                if (bcrypt) {
                    isValid = bcrypt.compareSync(password, teacherPassStored);
                } else {
                    console.error('Bcrypt is missing; cannot verify hashed teacher password.');
                    return { success: false, message: 'Secure login library is offline.' };
                }
            } else {
                // Plain-text fallback check
                isValid = (password === teacherPassStored);
                if (isValid) {
                    needsMigration = true;
                }
            }

            if (!isValid) {
                return { success: false, message: 'Invalid password.' };
            }

            // Auto-migrate teacher password to secure hash
            if (needsMigration) {
                try {
                    console.log(`Migrating password for teacher ${teacher.email} to bcrypt hash...`);
                    const hashedPass = await AuthUtils.hashPassword(password);
                    if (window.SchoolApp && window.SchoolApp.store) {
                        const targetTchr = window.SchoolApp.store.teachers.find(t => t.id === teacher.id);
                        if (targetTchr) {
                            targetTchr.password = hashedPass;
                            await window.SchoolApp.save();
                            console.log('Teacher password migration complete.');
                        }
                    }
                } catch (e) {
                    console.error('Failed to auto-migrate teacher password:', e);
                }
            }

            return { success: true, user: teacher };
        }

        return { success: false, message: 'Invalid authentication role.' };
    };

    /**
     * Performs bulk migration of all unhashed teacher passwords.
     * @returns {Promise<number>} - Count of migrated teacher passwords
     */
    AuthUtils.bulkMigrateTeacherPasswords = async function () {
        if (!window.SchoolApp || !window.SchoolApp.store || !window.SchoolApp.store.teachers) {
            return 0;
        }

        const teachers = window.SchoolApp.store.teachers;
        let migrationCount = 0;

        for (let i = 0; i < teachers.length; i++) {
            const t = teachers[i];
            if (t.password && !AuthUtils.isHashed(t.password)) {
                t.password = await AuthUtils.hashPassword(t.password);
                migrationCount++;
            }
        }

        if (migrationCount > 0) {
            await window.SchoolApp.save();
            console.log(`Bulk migrated ${migrationCount} teacher passwords.`);
        }

        return migrationCount;
    };

})();
