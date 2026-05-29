// src/js/utils/profanity.js

// A very basic blocklist. In a real app, this would be more comprehensive.
const BLOCKLIST = [
  "admin", "moderator", "system", "orbit", // Reserved words
  "fuck", "shit", "bitch", "asshole", "cunt", "nigger", "faggot", "slut", "whore" // Basic profanity
];

window.Profanity = {
  check(text) {
    if (!text) return { isValid: true };
    const lowerText = text.toLowerCase();
    
    for (const word of BLOCKLIST) {
      if (lowerText.includes(word)) {
        return {
          isValid: false,
          error: `The word "${word}" is not allowed.`
        };
      }
    }
    
    return { isValid: true };
  },
  
  validateUsername(username) {
    if (!username || username.length < 2 || username.length > 32) {
      return { isValid: false, error: "Username must be 2-32 characters." };
    }
    if (!/^[a-zA-Z0-9 _-]+$/.test(username)) {
      return { isValid: false, error: "Username can only contain letters, numbers, spaces, underscores, and hyphens." };
    }
    return this.check(username);
  }
};
