// Welcome page functionality
function openExtension() {
  chrome.runtime.sendMessage({ action: 'openPopup' });
}

// Add event listener when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
  // Add click event listener to the button instead of inline onclick
  const button = document.querySelector('.cta button');
  if (button) {
    button.addEventListener('click', openExtension);
  }
});
