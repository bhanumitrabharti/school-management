'use strict';

(function() {
  var chatbotOpen = false;
  var chatbotContainer = null;

  function init() {
    createChatbotDOM();
    attachEvents();
  }

  function createChatbotDOM() {
    var layout = document.getElementById('app-layout');
    if (!layout) return;

    chatbotContainer = document.createElement('div');
    chatbotContainer.id = 'svm-chatbot-widget';
    chatbotContainer.className = 'svm-chatbot-widget';
    chatbotContainer.innerHTML = `
      <!-- Floating Action Button -->
      <button id="chatbot-toggle-btn" class="chatbot-toggle-btn" title="Open ERP Support Chat">
        <span class="material-icons-round">support_agent</span>
      </button>

      <!-- Chat Window -->
      <div id="chatbot-window" class="chatbot-window hidden">
        <div class="chatbot-header">
          <div class="chatbot-header-info">
            <span class="material-icons-round header-icon">support_agent</span>
            <div>
              <h4 class="chatbot-header-title">SVM Support Guide</h4>
              <p class="chatbot-header-status"><span class="status-dot"></span> Interactive Mode</p>
            </div>
          </div>
          <button id="chatbot-close-btn" class="chatbot-close-btn" title="Close Chat">
            <span class="material-icons-round">close</span>
          </button>
        </div>
        <div id="chatbot-messages" class="chatbot-messages">
          <div class="chatbot-message bot-message">
            <p style="margin: 0 0 12px 0;">Namaste! 🙏 Welcome to Shishu Vikash Mandir ERP Support. Please select one of the following interactive guides for help:</p>
            <div class="chatbot-options" style="display: flex; flex-direction: column; gap: 8px;">
              <button class="chatbot-opt-btn" data-action="fee-help">
                <span class="material-icons-round" style="font-size: 16px; color: var(--accent-secondary)">payments</span> Fee Help
              </button>
              <button class="chatbot-opt-btn" data-action="attendance-help">
                <span class="material-icons-round" style="font-size: 16px; color: var(--accent-secondary)">fact_check</span> Attendance Help
              </button>
              <button class="chatbot-opt-btn" data-action="contact-dev">
                <span class="material-icons-round" style="font-size: 16px; color: var(--accent-secondary)">support_agent</span> Contact Developer
              </button>
            </div>
          </div>
        </div>
        <div class="chatbot-input-area">
          <input type="text" id="chatbot-input" class="chatbot-input" placeholder="Type your question..." autocomplete="off">
          <button id="chatbot-send-btn" class="chatbot-send-btn" title="Send Message">
            <span class="material-icons-round">send</span>
          </button>
        </div>
      </div>
    `;
    layout.appendChild(chatbotContainer);
  }

  function attachEvents() {
    var toggleBtn = document.getElementById('chatbot-toggle-btn');
    var closeBtn = document.getElementById('chatbot-close-btn');
    var sendBtn = document.getElementById('chatbot-send-btn');
    var inputField = document.getElementById('chatbot-input');

    if (toggleBtn) {
      toggleBtn.addEventListener('click', toggleChatbot);
    }
    if (closeBtn) {
      closeBtn.addEventListener('click', toggleChatbot);
    }
    if (sendBtn) {
      sendBtn.addEventListener('click', handleSendMessage);
    }
    if (inputField) {
      inputField.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
          handleSendMessage();
        }
      });
    }

    // Attach delegated option click listeners
    var messagesContainer = document.getElementById('chatbot-messages');
    if (messagesContainer) {
      messagesContainer.addEventListener('click', function(e) {
        var btn = e.target.closest('.chatbot-opt-btn');
        if (btn) {
          var action = btn.getAttribute('data-action');
          handleOptionClick(action);
        }
      });
    }
  }

  function toggleChatbot() {
    var chatWindow = document.getElementById('chatbot-window');
    if (!chatWindow) return;
    chatbotOpen = !chatbotOpen;
    if (chatbotOpen) {
      chatWindow.classList.remove('hidden');
      document.getElementById('chatbot-input').focus();
    } else {
      chatWindow.classList.add('hidden');
    }
  }

  function appendMessage(text, sender) {
    var messagesContainer = document.getElementById('chatbot-messages');
    if (!messagesContainer) return;

    var msgDiv = document.createElement('div');
    msgDiv.className = 'chatbot-message ' + sender + '-message';
    msgDiv.textContent = text;
    messagesContainer.appendChild(msgDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }

  function showTypingIndicator() {
    var messagesContainer = document.getElementById('chatbot-messages');
    if (!messagesContainer) return;

    var loaderDiv = document.createElement('div');
    loaderDiv.id = 'chatbot-typing-indicator';
    loaderDiv.className = 'chatbot-message bot-message typing-indicator';
    loaderDiv.innerHTML = `
      <span></span>
      <span></span>
      <span></span>
    `;
    messagesContainer.appendChild(loaderDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }

  function removeTypingIndicator() {
    var loaderDiv = document.getElementById('chatbot-typing-indicator');
    if (loaderDiv) {
      loaderDiv.remove();
    }
  }

  function handleSendMessage() {
    var inputField = document.getElementById('chatbot-input');
    if (!inputField) return;

    var text = inputField.value.trim();
    if (!text) return;

    inputField.value = '';
    appendMessage(text, 'user');
    showTypingIndicator();

    setTimeout(function() {
      removeTypingIndicator();
      appendBotFallbackResponse();
    }, 600);
  }

  function appendBotFallbackResponse() {
    var messagesContainer = document.getElementById('chatbot-messages');
    if (!messagesContainer) return;

    var msgDiv = document.createElement('div');
    msgDiv.className = 'chatbot-message bot-message';
    msgDiv.innerHTML = `
      <p style="margin: 0 0 12px 0;">Our AI support assistant is currently offline. Please use the quick links below or visit the Help Center for step-by-step documentation:</p>
      <div class="chatbot-options" style="display: flex; flex-direction: column; gap: 8px;">
        <button class="chatbot-opt-btn" data-action="fee-help">
          <span class="material-icons-round" style="font-size: 16px; color: var(--accent-secondary)">payments</span> Fee Help
        </button>
        <button class="chatbot-opt-btn" data-action="attendance-help">
          <span class="material-icons-round" style="font-size: 16px; color: var(--accent-secondary)">fact_check</span> Attendance Help
        </button>
        <button class="chatbot-opt-btn" data-action="contact-dev">
          <span class="material-icons-round" style="font-size: 16px; color: var(--accent-secondary)">support_agent</span> Contact Developer
        </button>
      </div>
    `;
    messagesContainer.appendChild(msgDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }

  function handleOptionClick(action) {
    if (action === 'fee-help') {
      if (window.SchoolApp && window.SchoolApp.modules.support) {
        window.SchoolApp.modules.support.selectCategory('fees');
        toggleChatbot();
      }
    } else if (action === 'attendance-help') {
      if (window.SchoolApp && window.SchoolApp.modules.support) {
        window.SchoolApp.modules.support.selectCategory('attendance');
        toggleChatbot();
      }
    } else if (action === 'contact-dev') {
      if (window.SchoolApp && window.SchoolApp.modules.support) {
        window.SchoolApp.modules.support.openContactModal();
        toggleChatbot();
      }
    }
  }

  window.addEventListener('DOMContentLoaded', init);

})();
