'use strict';

/**
 * api/_lib/parents/profile.js
 * 
 * Handles action: 'profile'
 * Returns safe profile card details for the single requested student.
 */

const { authenticateParentRequest } = require('./auth');

async function handleProfile(req, res) {
  const authRes = await authenticateParentRequest(req, res, 'profile');
  if (!authRes.authorized) return;

  const { student, portalConfig, schoolId } = authRes;

  return res.status(200).json({
    success: true,
    student: {
      id: student.id,
      name: student.name || `${student.firstName || ''} ${student.lastName || ''}`.trim(),
      firstName: student.firstName || '',
      lastName: student.lastName || '',
      class: student.class || '',
      section: student.section || '',
      rollNumber: student.rollNumber || student.rollNo || '',
      admissionNumber: student.admissionNumber || student.admissionNo || '',
      photoUrl: student.photoUrl || student.photoStorageUrl || '',
      dob: student.dob || '',
      gender: student.gender || '',
      bloodGroup: student.bloodGroup || '',
      academicYear: student.academicYear || student.session || '2025-26'
    },
    school: {
      schoolId: schoolId,
      schoolName: portalConfig.schoolName,
      logoUrl: portalConfig.logoUrl
    }
  });
}

module.exports = { handleProfile };
