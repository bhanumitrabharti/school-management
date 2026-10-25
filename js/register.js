/**
 * Paathshala Self-Service School Onboarding Controller
 * Handles 3-step registration wizard, live subdomain validation, Turnstile, OTP and provisioning.
 */

(function () {
  'use strict';

  // State
  let currentStep = 1;
  let currentRegId = null;
  let subdomainEditedManually = false;
  let usernameEditedManually = false;
  let subdomainCheckTimer = null;
  let isSubdomainAvailable = false;
  let turnstileWidgetId = null;
  let turnstileToken = null;

  // Timers
  let otpExpiryInterval = null;
  let otpExpiryRemaining = 600; // 10 minutes
  let resendCooldownInterval = null;
  let resendCooldownRemaining = 60;
  let attemptsRemaining = 5;

  // DOM Elements
  const alertBanner = document.getElementById('alert-banner');
  const stepperProgress = document.getElementById('stepper-progress');
  const stepNodes = [
    document.getElementById('step-node-1'),
    document.getElementById('step-node-2'),
    document.getElementById('step-node-3')
  ];
  const stepForms = [
    document.getElementById('step-1-form'),
    document.getElementById('step-2-form'),
    document.getElementById('step-3-form'),
    document.getElementById('step-4-success')
  ];

  // Inputs
  const schoolNameInput = document.getElementById('schoolName');
  const cityInput = document.getElementById('city');
  const stateSelect = document.getElementById('state');
  const subdomainInput = document.getElementById('subdomain');
  const subdomainFeedback = document.getElementById('subdomain-feedback');
  const portalUrlPreview = document.getElementById('portal-url-preview');
  const referralCodeInput = document.getElementById('referralCode');

  const adminNameInput = document.getElementById('adminName');
  const adminEmailInput = document.getElementById('adminEmail');
  const adminPhoneInput = document.getElementById('adminPhone');
  const adminUsernameInput = document.getElementById('adminUsername');
  const adminPasswordInput = document.getElementById('adminPassword');
  const adminConfirmPasswordInput = document.getElementById('adminConfirmPassword');
  const agreeTermsCheckbox = document.getElementById('agreeTerms');
  const marketingConsentCheckbox = document.getElementById('marketingConsent');

  const otpDigits = Array.from(document.querySelectorAll('.otp-digit'));
  const timerDisplay = document.getElementById('timer-display');
  const attemptsDisplay = document.getElementById('attempts-display');
  const resendCountdown = document.getElementById('resend-countdown');
  const btnResendOtp = document.getElementById('btn-resend-otp');
  const displayMaskedEmail = document.getElementById('display-masked-email');

  // Navigation Buttons
  const btnToStep2 = document.getElementById('btn-to-step-2');
  const btnBackTo1 = document.getElementById('btn-back-to-1');
  const btnSubmitStep2 = document.getElementById('btn-submit-step-2');
  const btnBackTo2 = document.getElementById('btn-back-to-2');
  const btnVerifyOtp = document.getElementById('btn-verify-otp');

  // Success view elements
  const resSchoolName = document.getElementById('res-school-name');
  const resErpUrl = document.getElementById('res-erp-url');
  const resAdminUsername = document.getElementById('res-admin-username');
  const btnCopyUrl = document.getElementById('btn-copy-url');
  const btnLaunchErp = document.getElementById('btn-launch-erp');

  // Helper: Banner Alert
  function showAlert(msg, type = 'error') {
    if (!alertBanner) return;
    alertBanner.className = `alert-banner ${type}`;
    alertBanner.innerHTML = `<span>${msg}</span>`;
    alertBanner.style.display = 'flex';
    alertBanner.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function hideAlert() {
    if (!alertBanner) return;
    alertBanner.style.display = 'none';
    alertBanner.innerHTML = '';
  }

  // D2 Helper: Suggest Admin Username
  function suggestUsername(name) {
    if (!name || typeof name !== 'string') return 'admin';
    const clean = name.trim().replace(/[^a-zA-Z0-9\s]/g, '');
    const words = clean.split(/\s+/).filter(Boolean);
    if (words.length === 0) return 'admin';

    let initials = '';
    for (const w of words) initials += w[0].toLowerCase();

    let base = initials.length >= 2 ? initials : words[0].toLowerCase();
    let username = (base + 'admin').toLowerCase().replace(/[^a-z0-9._]/g, '');
    if (username.length < 4) username = 'admin';
    if (username.length > 30) username = username.substring(0, 30);
    return username;
  }

  // Suggest Subdomain slug
  function suggestSubdomain(name) {
    if (!name) return '';
    return name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 30);
  }

  // Update Stepper Visuals
  function setStep(step) {
    currentStep = step;
    hideAlert();

    // Progress bar width
    if (stepperProgress) {
      if (step === 1) stepperProgress.style.width = '0%';
      else if (step === 2) stepperProgress.style.width = '50%';
      else if (step >= 3) stepperProgress.style.width = '100%';
    }

    // Step nodes
    stepNodes.forEach((node, idx) => {
      if (!node) return;
      const nodeStep = idx + 1;
      node.classList.remove('active', 'completed');
      if (nodeStep === step) {
        node.classList.add('active');
      } else if (nodeStep < step) {
        node.classList.add('completed');
        node.querySelector('.step-bubble').innerHTML = '✓';
      } else {
        node.querySelector('.step-bubble').textContent = nodeStep;
      }
    });

    // Step form containers
    stepForms.forEach((form, idx) => {
      if (!form) return;
      form.classList.remove('active');
      if (idx + 1 === step) {
        form.classList.add('active');
      }
    });

    // Scroll top of container
    const card = document.querySelector('.card');
    if (card) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // Subdomain Validation via API
  async function checkSubdomainAvailability(sub) {
    if (!sub || sub.length < 3) {
      isSubdomainAvailable = false;
      subdomainFeedback.className = 'subdomain-feedback';
      subdomainFeedback.innerHTML = 'Subdomain must be at least 3 characters.';
      return;
    }

    subdomainFeedback.className = 'subdomain-feedback loading';
    subdomainFeedback.innerHTML = '<span class="spinner" style="border-top-color:var(--muted);width:14px;height:14px;border-width:1.5px;"></span> Checking availability...';

    try {
      const res = await fetch(`/api/subdomain-check?subdomain=${encodeURIComponent(sub)}`);
      const data = await res.json();

      if (data.available) {
        isSubdomainAvailable = true;
        subdomainFeedback.className = 'subdomain-feedback ok';
        subdomainFeedback.innerHTML = `✓ <b>${sub}.ctrlshifts.in</b> is available!`;
        if (portalUrlPreview) {
          portalUrlPreview.textContent = `https://${sub}.ctrlshifts.in`;
        }
      } else {
        isSubdomainAvailable = false;
        subdomainFeedback.className = 'subdomain-feedback err';
        subdomainFeedback.innerHTML = `✗ ${data.reason || 'This subdomain is not available.'}`;
      }
    } catch (err) {
      isSubdomainAvailable = false;
      subdomainFeedback.className = 'subdomain-feedback err';
      subdomainFeedback.innerHTML = 'Could not check availability. Please check your network.';
    }
  }

  // Attach Subdomain & School Name Listeners
  if (schoolNameInput) {
    schoolNameInput.addEventListener('input', () => {
      const name = schoolNameInput.value;
      if (!subdomainEditedManually) {
        const slug = suggestSubdomain(name);
        if (subdomainInput) {
          subdomainInput.value = slug;
          if (portalUrlPreview) portalUrlPreview.textContent = `https://${slug || 'school'}.ctrlshifts.in`;
          clearTimeout(subdomainCheckTimer);
          if (slug.length >= 3) {
            subdomainCheckTimer = setTimeout(() => checkSubdomainAvailability(slug), 350);
          }
        }
      }
      if (!usernameEditedManually && adminUsernameInput) {
        adminUsernameInput.value = suggestUsername(name);
      }
    });
  }

  if (subdomainInput) {
    subdomainInput.addEventListener('input', () => {
      subdomainEditedManually = true;
      let val = subdomainInput.value.toLowerCase().replace(/[^a-z0-9-]/g, '');
      subdomainInput.value = val;
      if (portalUrlPreview) portalUrlPreview.textContent = `https://${val || 'school'}.ctrlshifts.in`;

      clearTimeout(subdomainCheckTimer);
      if (val.length >= 3) {
        subdomainCheckTimer = setTimeout(() => checkSubdomainAvailability(val), 350);
      } else {
        isSubdomainAvailable = false;
        subdomainFeedback.className = 'subdomain-feedback';
        subdomainFeedback.innerHTML = 'Subdomain must be at least 3 characters.';
      }
    });
  }

  if (adminUsernameInput) {
    adminUsernameInput.addEventListener('input', () => {
      usernameEditedManually = true;
      adminUsernameInput.value = adminUsernameInput.value.toLowerCase().replace(/[^a-z0-9._]/g, '');
    });
  }

  // Step 1 Validation & Proceed
  if (btnToStep2) {
    btnToStep2.addEventListener('click', () => {
      hideAlert();
      const schoolName = (schoolNameInput.value || '').trim();
      const city = (cityInput.value || '').trim();
      const state = (stateSelect.value || '').trim();
      const subdomain = (subdomainInput.value || '').trim().toLowerCase();

      if (!schoolName || schoolName.length < 2) {
        showAlert('Please enter your school full name.');
        schoolNameInput.focus();
        return;
      }
      if (!city) {
        showAlert('Please enter your school city / town.');
        cityInput.focus();
        return;
      }
      if (!state) {
        showAlert('Please select your state.');
        stateSelect.focus();
        return;
      }
      if (!subdomain || subdomain.length < 3) {
        showAlert('Please choose an ERP subdomain (minimum 3 characters).');
        subdomainInput.focus();
        return;
      }
      if (!isSubdomainAvailable) {
        showAlert('Please choose an available subdomain before proceeding.');
        subdomainInput.focus();
        return;
      }

      // Pre-fill username if still empty
      if (!adminUsernameInput.value) {
        adminUsernameInput.value = suggestUsername(schoolName);
      }

      setStep(2);
      renderTurnstile();
    });
  }

  // Step 2 Back
  if (btnBackTo1) {
    btnBackTo1.addEventListener('click', () => {
      setStep(1);
    });
  }

  // Render Turnstile
  function renderTurnstile() {
    if (window.turnstile && document.getElementById('turnstile-container')) {
      if (turnstileWidgetId === null) {
        try {
          const isLocalhost = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
          let sitekey = window.TURNSTILE_SITE_KEY;
          if (!sitekey && isLocalhost) {
            sitekey = '1x00000000000000000000AA';
          }
          if (!sitekey) {
            console.error('Turnstile site key missing in production.');
            const container = document.getElementById('turnstile-container');
            if (container) {
              container.innerHTML = '<div style="color:var(--red);font-size:0.85rem;padding:8px 0;">Security verification service unavailable. Please refresh or contact support.</div>';
            }
            return;
          }
          turnstileWidgetId = window.turnstile.render('#turnstile-container', {
            sitekey: sitekey,
            callback: function (token) {
              turnstileToken = token;
            }
          });
        } catch (e) {
          console.warn('Turnstile render note:', e.message);
        }
      }
    }
  }

  // Step 2 Validation & Submit to Registration Start
  if (btnSubmitStep2) {
    btnSubmitStep2.addEventListener('click', async () => {
      hideAlert();

      const adminName = (adminNameInput.value || '').trim();
      const adminEmail = (adminEmailInput.value || '').trim().toLowerCase();
      const adminPhone = (adminPhoneInput.value || '').replace(/\D/g, '').trim();
      const adminUsername = (adminUsernameInput.value || '').trim().toLowerCase();
      const adminPassword = adminPasswordInput.value || '';
      const confirmPassword = adminConfirmPasswordInput.value || '';
      const agreeTerms = agreeTermsCheckbox.checked;
      const marketingConsent = marketingConsentCheckbox.checked;

      if (!adminName) {
        showAlert('Please enter administrator full name.');
        adminNameInput.focus();
        return;
      }
      if (!adminEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail)) {
        showAlert('Please enter a valid email address.');
        adminEmailInput.focus();
        return;
      }
      if (!adminPhone || adminPhone.length < 10) {
        showAlert('Please enter a valid 10-digit mobile number.');
        adminPhoneInput.focus();
        return;
      }
      if (!adminUsername || adminUsername.length < 4) {
        showAlert('Admin login username must be at least 4 characters.');
        adminUsernameInput.focus();
        return;
      }
      if (!/^[a-z0-9._]+$/.test(adminUsername)) {
        showAlert('Username can only contain lowercase letters, numbers, dots, and underscores.');
        adminUsernameInput.focus();
        return;
      }
      if (!adminPassword || adminPassword.length < 8) {
        showAlert('Password must be at least 8 characters long.');
        adminPasswordInput.focus();
        return;
      }
      if (adminPassword !== confirmPassword) {
        showAlert('Passwords do not match. Please re-enter.');
        adminConfirmPasswordInput.focus();
        return;
      }
      if (!agreeTerms) {
        showAlert('You must agree to the Terms of Service and Privacy Policy to proceed.');
        agreeTermsCheckbox.focus();
        return;
      }

      const isLocalhost = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
      if (!turnstileToken && !isLocalhost) {
        showAlert('Please complete the security verification (captcha) to proceed.');
        return;
      }

      // Prepare payload
      const payload = {
        schoolName: schoolNameInput.value.trim(),
        city: cityInput.value.trim(),
        state: stateSelect.value.trim(),
        subdomain: subdomainInput.value.trim().toLowerCase(),
        referralCode: (referralCodeInput.value || '').trim().toUpperCase(),
        adminName,
        adminEmail,
        adminPhone,
        adminMobile: adminPhone,
        adminUsername,
        adminPassword,
        termsAccepted: true,
        marketingConsent: marketingConsent,
        turnstileToken: turnstileToken || (isLocalhost ? 'mock-client-token' : '')
      };

      btnSubmitStep2.disabled = true;
      btnSubmitStep2.innerHTML = '<span class="spinner"></span> Creating Account...';

      try {
        const resp = await fetch('/api/registration-start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        const data = await resp.json();

        if (!resp.ok) {
          showAlert(data.error || 'Registration failed. Please check your details.');
          btnSubmitStep2.disabled = false;
          btnSubmitStep2.innerHTML = 'Send Verification Code →';
          return;
        }

        // Registration started successfully
        currentRegId = data.regId;
        if (displayMaskedEmail) {
          displayMaskedEmail.textContent = data.maskedEmail || adminEmail;
        }

        setStep(3);
        startOtpExpiryTimer();
        startResendCooldown(60);

        // Focus first OTP input
        if (otpDigits[0]) otpDigits[0].focus();

      } catch (err) {
        showAlert('Network error occurred. Please check your connection and try again.');
        btnSubmitStep2.disabled = false;
        btnSubmitStep2.innerHTML = 'Send Verification Code →';
      }
    });
  }

  // Step 3 Back to Email
  if (btnBackTo2) {
    btnBackTo2.addEventListener('click', () => {
      clearInterval(otpExpiryInterval);
      clearInterval(resendCooldownInterval);
      setStep(2);
      btnSubmitStep2.disabled = false;
      btnSubmitStep2.innerHTML = 'Send Verification Code →';
    });
  }

  // OTP Input Auto-Advance & Paste
  otpDigits.forEach((digitInput, idx) => {
    digitInput.addEventListener('input', (e) => {
      const val = digitInput.value.replace(/\D/g, '');
      digitInput.value = val ? val[0] : '';
      if (val && idx < otpDigits.length - 1) {
        otpDigits[idx + 1].focus();
      }
    });

    digitInput.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !digitInput.value && idx > 0) {
        otpDigits[idx - 1].focus();
      }
    });

    digitInput.addEventListener('paste', (e) => {
      e.preventDefault();
      const pasted = (e.clipboardData || window.clipboardData).getData('text');
      const digits = pasted.replace(/\D/g, '').slice(0, 6);
      if (digits) {
        digits.split('').forEach((char, i) => {
          if (otpDigits[i]) otpDigits[i].value = char;
        });
        const nextFocus = Math.min(digits.length, otpDigits.length - 1);
        if (otpDigits[nextFocus]) otpDigits[nextFocus].focus();
      }
    });
  });

  function getEnteredOtp() {
    return otpDigits.map(d => d.value.trim()).join('');
  }

  // Timers
  function startOtpExpiryTimer() {
    clearInterval(otpExpiryInterval);
    otpExpiryRemaining = 600; // 10 mins
    updateExpiryDisplay();

    otpExpiryInterval = setInterval(() => {
      otpExpiryRemaining--;
      updateExpiryDisplay();
      if (otpExpiryRemaining <= 0) {
        clearInterval(otpExpiryInterval);
        showAlert('Verification code has expired. Please request a new one.');
        if (btnVerifyOtp) btnVerifyOtp.disabled = true;
      }
    }, 1000);
  }

  function updateExpiryDisplay() {
    if (!timerDisplay) return;
    const mins = Math.floor(otpExpiryRemaining / 60);
    const secs = otpExpiryRemaining % 60;
    timerDisplay.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  function startResendCooldown(seconds = 60) {
    clearInterval(resendCooldownInterval);
    resendCooldownRemaining = seconds;
    if (btnResendOtp) {
      btnResendOtp.disabled = true;
      resendCountdown.textContent = resendCooldownRemaining;
    }

    resendCooldownInterval = setInterval(() => {
      resendCooldownRemaining--;
      if (resendCountdown) resendCountdown.textContent = resendCooldownRemaining;
      if (resendCooldownRemaining <= 0) {
        clearInterval(resendCooldownInterval);
        if (btnResendOtp) {
          btnResendOtp.disabled = false;
          btnResendOtp.textContent = 'Resend Code';
        }
      }
    }, 1000);
  }

  // Resend OTP Action
  if (btnResendOtp) {
    btnResendOtp.addEventListener('click', async () => {
      if (!currentRegId) return;
      hideAlert();
      btnResendOtp.disabled = true;
      btnResendOtp.textContent = 'Sending...';

      try {
        const resp = await fetch('/api/registration-verify-otp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ regId: currentRegId, action: 'resend' })
        });
        const data = await resp.json();

        if (resp.ok) {
          showAlert('A new verification code has been sent to your email.', 'info');
          startResendCooldown(data.cooldownSeconds || 60);
          startOtpExpiryTimer();
          if (btnVerifyOtp) btnVerifyOtp.disabled = false;
        } else {
          showAlert(data.error || 'Failed to resend code.');
          btnResendOtp.disabled = false;
          btnResendOtp.textContent = 'Resend Code';
        }
      } catch (e) {
        showAlert('Could not resend code. Please try again.');
        btnResendOtp.disabled = false;
        btnResendOtp.textContent = 'Resend Code';
      }
    });
  }

  // Verify OTP and Provision
  if (btnVerifyOtp) {
    btnVerifyOtp.addEventListener('click', async () => {
      hideAlert();
      const otp = getEnteredOtp();
      if (!otp || otp.length !== 6) {
        showAlert('Please enter all 6 digits of the verification code.');
        return;
      }

      btnVerifyOtp.disabled = true;
      btnVerifyOtp.innerHTML = '<span class="spinner"></span> Verifying Code...';

      try {
        // 1. Verify OTP
        const vResp = await fetch('/api/registration-verify-otp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ regId: currentRegId, otp })
        });
        const vData = await vResp.json();

        if (!vResp.ok) {
          if (typeof vData.attemptsLeft !== 'undefined') {
            attemptsRemaining = vData.attemptsLeft;
            if (attemptsDisplay) {
              attemptsDisplay.textContent = `${attemptsRemaining} attempts left`;
            }
          }
          showAlert(vData.error || 'Verification failed. Incorrect code.');
          btnVerifyOtp.disabled = false;
          btnVerifyOtp.innerHTML = 'Verify & Provision ERP 🚀';
          return;
        }

        // 2. Provision ERP
        btnVerifyOtp.innerHTML = '<span class="spinner"></span> Provisioning Your School ERP...';

        const pResp = await fetch('/api/registration-provision', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ regId: currentRegId })
        });
        const pData = await pResp.json();

        if (!pResp.ok) {
          showAlert(pData.error || 'Provisioning failed. Our support team has been notified.');
          btnVerifyOtp.disabled = false;
          btnVerifyOtp.innerHTML = 'Verify & Provision ERP 🚀';
          return;
        }

        // Success!
        clearInterval(otpExpiryInterval);
        clearInterval(resendCooldownInterval);

        // Populate success view
        if (resSchoolName) resSchoolName.textContent = schoolNameInput.value;
        if (resErpUrl) {
          resErpUrl.href = pData.erpUrl;
          resErpUrl.textContent = pData.erpUrl;
        }
        if (resAdminUsername) resAdminUsername.textContent = pData.adminUsername;
        if (btnLaunchErp) btnLaunchErp.href = pData.erpUrl;

        // Hide stepper and intro for celebration view
        const stepper = document.getElementById('stepper');
        const intro = document.getElementById('intro-area');
        if (stepper) stepper.style.display = 'none';
        if (intro) intro.style.display = 'none';

        setStep(4);

      } catch (err) {
        showAlert('Network error while completing registration. Please contact connect@ctrlshifts.in.');
        btnVerifyOtp.disabled = false;
        btnVerifyOtp.innerHTML = 'Verify & Provision ERP 🚀';
      }
    });
  }

  // Copy ERP URL button
  if (btnCopyUrl) {
    btnCopyUrl.addEventListener('click', () => {
      if (resErpUrl && resErpUrl.href) {
        navigator.clipboard.writeText(resErpUrl.href).then(() => {
          btnCopyUrl.textContent = 'Copied!';
          setTimeout(() => { btnCopyUrl.textContent = 'Copy Link'; }, 2000);
        });
      }
    });
  }

  // Initialize
  setStep(1);

})();
