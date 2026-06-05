/* ============================================================
   CtrlShift Solutions - Marketing Landing Page Scripts
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {
  // Sticky Navbar Scroll Handler
  const navbar = document.querySelector('.navbar');
  if (navbar) {
    window.addEventListener('scroll', () => {
      if (window.scrollY > 50) {
        navbar.classList.add('scrolled');
      } else {
        navbar.classList.remove('scrolled');
      }
    });
  }

  // Mobile Navigation Menu Hamburger Toggle
  const mobileMenuToggle = document.getElementById('mobile-menu-toggle');
  const mobileNav = document.getElementById('mobile-nav');
  if (mobileMenuToggle && mobileNav) {
    mobileMenuToggle.addEventListener('click', () => {
      mobileNav.classList.toggle('active');
      const icon = mobileMenuToggle.querySelector('.material-icons-round');
      if (icon) {
        icon.textContent = mobileNav.classList.contains('active') ? 'close' : 'menu';
      }
    });

    // Close mobile nav when clicking a link
    const mobileLinks = mobileNav.querySelectorAll('a');
    mobileLinks.forEach(link => {
      link.addEventListener('click', () => {
        mobileNav.classList.remove('active');
        const icon = mobileMenuToggle.querySelector('.material-icons-round');
        if (icon) {
          icon.textContent = 'menu';
        }
      });
    });
  }

  // IntersectionObserver scroll reveal logic
  const revealElements = document.querySelectorAll('.scroll-reveal');
  if (revealElements.length > 0) {
    const revealObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('revealed');
          observer.unobserve(entry.target);
        }
      });
    }, {
      threshold: 0.1,
      rootMargin: '0px 0px -50px 0px'
    });

    revealElements.forEach(element => {
      revealObserver.observe(element);
    });
  }

  // Smooth Scroll offset adjustment for fixed header
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function(e) {
      const targetId = this.getAttribute('href');
      if (targetId === '#') return;
      
      const targetElement = document.querySelector(targetId);
      if (targetElement) {
        e.preventDefault();
        const headerHeight = navbar ? navbar.offsetHeight : 80;
        const targetPosition = targetElement.getBoundingClientRect().top + window.scrollY - headerHeight;
        
        window.scrollTo({
          top: targetPosition,
          behavior: 'smooth'
        });
      }
    });
  });

  // Contact Form Submission Handler
  const contactForm = document.getElementById('landing-contact-form');
  if (contactForm) {
    contactForm.addEventListener('submit', (e) => {
      e.preventDefault();
      
      const schoolName = document.getElementById('school-name').value;
      const ownerName = document.getElementById('owner-name').value;
      const phoneNumber = document.getElementById('phone-number').value;

      // Validate phone number format (10 digits)
      if (!/^\d{10}$/.test(phoneNumber)) {
        showToast('Please enter a valid 10-digit mobile number.', 'error');
        return;
      }

      // Disable button during processing
      const submitBtn = contactForm.querySelector('button[type="submit"]');
      const originalText = submitBtn.textContent;
      submitBtn.disabled = true;
      submitBtn.textContent = 'Scheduling...';

      // Simulate contact registration API call
      setTimeout(() => {
        showToast('Demo request registered successfully. We will contact you within 1 hour.', 'success');
        contactForm.reset();
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
      }, 1200);
    });
  }
});

/**
 * Creates and displays an elegant floating toast notification
 * @param {string} message - Notification text content
 * @param {'success'|'error'} type - Style theme for status indicators
 */
function showToast(message, type = 'success') {
  // Create toast container if it does not exist
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.style.cssText = `
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 9999;
      display: flex;
      flex-direction: column;
      gap: 12px;
      pointer-events: none;
    `;
    document.body.appendChild(container);
  }

  // Create toast element with modern styling
  const toast = document.createElement('div');
  toast.style.cssText = `
    min-width: 300px;
    max-width: 450px;
    padding: 16px 20px;
    background: rgba(13, 17, 39, 0.95);
    border: 1px solid ${type === 'success' ? '#10b981' : '#ef4444'};
    border-radius: 12px;
    color: #fff;
    font-family: 'Inter', sans-serif;
    font-size: 14px;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5), 0 0 20px rgba(0, 102, 255, 0.1);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    display: flex;
    align-items: center;
    gap: 12px;
    opacity: 0;
    transform: translateY(20px);
    transition: opacity 0.4s cubic-bezier(0.4, 0, 0.2, 1), transform 0.4s cubic-bezier(0.4, 0, 0.2, 1);
    pointer-events: auto;
  `;

  // Status icon configuration
  const icon = document.createElement('span');
  icon.className = 'material-icons-round';
  icon.style.color = type === 'success' ? '#10b981' : '#ef4444';
  icon.style.fontSize = '20px';
  icon.textContent = type === 'success' ? 'check_circle' : 'error_outline';
  toast.appendChild(icon);

  // Content text node
  const text = document.createElement('div');
  text.textContent = message;
  text.style.flex = '1';
  text.style.lineHeight = '1.4';
  toast.appendChild(text);

  // Dismiss button
  const closeBtn = document.createElement('span');
  closeBtn.className = 'material-icons-round';
  closeBtn.style.cssText = 'font-size: 18px; color: #64748b; cursor: pointer; transition: color 0.15s ease;';
  closeBtn.textContent = 'close';
  closeBtn.addEventListener('mouseenter', () => {
    closeBtn.style.color = '#f8fafc';
  });
  closeBtn.addEventListener('mouseleave', () => {
    closeBtn.style.color = '#64748b';
  });
  closeBtn.addEventListener('click', () => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-20px)';
    setTimeout(() => toast.remove(), 400);
  });
  toast.appendChild(closeBtn);

  container.appendChild(toast);

  // Trigger entrance transitions
  setTimeout(() => {
    toast.style.opacity = '1';
    toast.style.transform = 'translateY(0)';
  }, 10);

  // Setup auto-cleanup timeline
  setTimeout(() => {
    if (toast.parentNode) {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(-20px)';
      setTimeout(() => toast.remove(), 400);
    }
  }, 4000);
}
