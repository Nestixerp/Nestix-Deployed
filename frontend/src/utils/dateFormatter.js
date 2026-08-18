/**
 * Centralized date formatting utility
 * All dates in the application should use these functions to ensure
 * consistent formatting based on the system timezone from Settings
 */

let systemTimezone = 'Australia/Melbourne'; // Default

/**
 * Set the system timezone (should be called from Settings)
 */
export const setSystemTimezone = (timezone) => {
  systemTimezone = timezone || 'Australia/Melbourne';
};

/**
 * Get the current system timezone
 */
export const getSystemTimezone = () => {
  return systemTimezone;
};

/**
 * Format date as dd/mm/yyyy using system timezone
 */
export const formatDate = (dateString) => {
  if (!dateString) return 'N/A';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-AU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: systemTimezone
  });
};

/**
 * Format date and time as dd/mm/yyyy hh:mm AM/PM using system timezone
 */
export const formatDateTime = (dateString) => {
  if (!dateString) return 'N/A';
  const date = new Date(dateString);
  return date.toLocaleString('en-AU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: systemTimezone
  });
};

/**
 * Format date for input fields (yyyy-mm-dd)
 */
export const formatDateForInput = (dateString) => {
  if (!dateString) return '';
  const date = new Date(dateString);
  // Get date in system timezone and format as yyyy-mm-dd
  const formatted = date.toLocaleDateString('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: systemTimezone
  });
  return formatted;
};

/**
 * Format time for display (hh:mm AM/PM)
 */
export const formatTime = (dateString) => {
  if (!dateString) return 'N/A';
  const date = new Date(dateString);
  return date.toLocaleTimeString('en-AU', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: systemTimezone
  });
};

/**
 * Get current date/time in system timezone as ISO string
 */
export const getCurrentDateTime = () => {
  return new Date().toLocaleString('en-US', { timeZone: systemTimezone });
};

/**
 * Get current date in system timezone formatted as YYYY-MM-DD
 */
export const getCurrentDateInSystemTimezone = () => {
  // Get current date and time in Melbourne timezone
  const now = new Date();
  const melbourneDate = new Date(now.toLocaleString("en-US", {timeZone: "Australia/Melbourne"}));
  
  // Format as YYYY-MM-DD
  const year = melbourneDate.getFullYear();
  const month = String(melbourneDate.getMonth() + 1).padStart(2, '0');
  const day = String(melbourneDate.getDate()).padStart(2, '0');
  
  return `${year}-${month}-${day}`;
};
