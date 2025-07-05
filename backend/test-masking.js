// Test script for the new masking logic
function maskString(str, ratio, minVisible = 2) {
  if (!str || typeof str !== 'string' || str.length === 0) {
    return '';
  }
  
  if (ratio <= 0) {
    return str; // No masking
  }
  
  if (ratio >= 1) {
    return '*'.repeat(str.length); // Full masking
  }
  
  const totalVisibleChars = Math.max(minVisible, Math.floor(str.length * (1 - ratio)));
  const maskedChars = str.length - totalVisibleChars;
  
  if (maskedChars <= 0) {
    return str; // No masking needed
  }
  
  // For very short strings, show beginning and end
  if (str.length <= 4) {
    const visiblePart = str.substring(0, Math.ceil(totalVisibleChars / 2));
    const maskedPart = '*'.repeat(maskedChars);
    const endPart = totalVisibleChars > visiblePart.length ? 
      str.substring(str.length - (totalVisibleChars - visiblePart.length)) : '';
    return visiblePart + maskedPart + endPart;
  }
  
  // For longer strings, mask the middle part
  const startVisible = Math.ceil(totalVisibleChars / 2);
  const endVisible = totalVisibleChars - startVisible;
  
  const startPart = str.substring(0, startVisible);
  const endPart = endVisible > 0 ? str.substring(str.length - endVisible) : '';
  const maskedPart = '*'.repeat(maskedChars);
  
  return startPart + maskedPart + endPart;
}

// Test cases
console.log('Testing masking logic:');
console.log('');

// Test with different ratios and string lengths
const testCases = [
  { str: 'abc', ratio: 0.2, desc: 'Short string (3 chars)' },
  { str: 'test', ratio: 0.2, desc: 'Short string (4 chars)' },
  { str: 'username', ratio: 0.4, desc: 'Username (8 chars, 40% masked)' },
  { str: 'password123', ratio: 0.2, desc: 'Password (11 chars, 20% masked)' },
  { str: 'https://example.com', ratio: 0.2, desc: 'URL (19 chars, 20% masked)' },
  { str: 'verylongusernametest', ratio: 0.4, desc: 'Long username (20 chars, 40% masked)' },
  { str: 'a', ratio: 0.5, desc: 'Single character' },
  { str: 'ab', ratio: 0.5, desc: 'Two characters' },
];

testCases.forEach(({ str, ratio, desc }) => {
  const masked = maskString(str, ratio);
  console.log(`${desc}:`);
  console.log(`  Original: "${str}"`);
  console.log(`  Masked:   "${masked}"`);
  console.log(`  Ratio:    ${ratio} (${Math.floor(ratio * 100)}% masked)`);
  console.log('');
});
