/**
 * Sets a cookie.
 * @param {string} name - Name for the cookie.
 * @param {string} value - Value for the cookie.
 * @param {number} days - Number of days until the cookie should expire.
 */
function setCookie(name, value, days) {
  let expires = '';

  if (days) {
    const date = new Date();
    date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
    expires = `; expires=${date.toUTCString()}`;
  }

  document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}${expires}; path=/; SameSite=None; Secure`;
}

/**
 * Gets the value of a cookie (if it exists).
 * @param {string} name - Name of the cookie.
 * @returns {?string}
 */
function getCookie(name) {
  const cookieString = `; ${document.cookie}`;
  const cookies = cookieString.split(`; ${name}=`);

  if (cookies.length === 2) {
    return cookies.pop().split(';').shift();
  }

  return null;
}

/* global Modal */

if (!customElements.get('theme-notification')) {
  customElements.whenDefined('modal-dialog').then(() => {
    class ThemeNotification extends Modal {
      constructor() {
        super();
        this.cookie = `${this.id}-dismissed`;

        if (!getCookie(this.cookie)) this.open();
      }

      /**
       * Handles 'close' events on the modal.
       */
      close() {
        super.close();
        setCookie(this.cookie, true, this.dataset.dismissDays);
      }
    }

    customElements.define('theme-notification', ThemeNotification);
  });
}
