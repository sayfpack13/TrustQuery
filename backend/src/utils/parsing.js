// Data parsing utilities
const { getConfig } = require("../config");

// Helper function to parse a line for display in admin panel
function parseLineForDisplay(rawLine) {
  // This is a simplified parser - you might want to implement more sophisticated parsing
  // based on your data format
  const parts = rawLine.split(':');
  if (parts.length >= 2) {
    return {
      username: parts[0] || '',
      password: parts[1] || '',
      // Add more fields as needed
    };
  }
  return {
    username: rawLine,
    password: ''
  };
}

// Mask sensitive data based on configuration
function maskSensitiveData(data, type = 'default') {
  const maskingRatio = type === 'username' ? 
    getConfig('usernameMaskingRatio') : 
    getConfig('maskingRatio');
  
  if (!data || typeof data !== 'string') return data;
  
  const minVisible = getConfig('minVisibleChars');
  const visibleChars = Math.max(minVisible, Math.floor(data.length * (1 - maskingRatio)));
  const maskedChars = data.length - visibleChars;
  
  if (maskedChars <= 0) return data;
  
  return data.substring(0, visibleChars) + '*'.repeat(maskedChars);
}

// Apply masking to search results
function applyMasking(results) {
  const showRawLine = getConfig('adminSettings.showRawLineByDefault');
  
  return results.map(result => {
    if (showRawLine) {
      return result; // Return unmasked data
    }
    
    // Apply masking to sensitive fields
    const masked = { ...result };
    if (masked.username) {
      masked.username = maskSensitiveData(masked.username, 'username');
    }
    if (masked.password) {
      masked.password = maskSensitiveData(masked.password, 'password');
    }
    
    return masked;
  });
}

module.exports = {
  parseLineForDisplay,
  maskSensitiveData,
  applyMasking
};
