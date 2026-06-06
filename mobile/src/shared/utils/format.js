// src/js/utils/format.js

window.Format = {
  absoluteTime(isoString) {
    if (!isoString) return '';
    const d = new Date(isoString);
    
    let hours = d.getHours();
    let timeStr = '';
    
    // Check global store for 24h format setting
    const use24h = window.store && window.store.getState().settings.timeFormat24;
    
    if (use24h) {
      const h24 = hours.toString().padStart(2, '0');
      const minutes = d.getMinutes().toString().padStart(2, '0');
      timeStr = `${h24}:${minutes}`;
    } else {
      const ampm = hours >= 12 ? 'PM' : 'AM';
      hours = hours % 12;
      hours = hours ? hours : 12; 
      const minutes = d.getMinutes().toString().padStart(2, '0');
      timeStr = `${hours}:${minutes} ${ampm}`;
    }
    
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const month = monthNames[d.getMonth()];
    const date = d.getDate();
    
    return `${timeStr} · ${month} ${date}`;
  },

  // Format relative time: "2s ago", "5 min", "Just now"
  relativeTime(isoString) {
    if (!isoString) return '';
    const d = new Date(isoString);
    const now = new Date();
    const diffSec = Math.floor((now - d) / 1000);

    if (diffSec < 10) return "Just now";
    if (diffSec < 60) return `${diffSec}s ago`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin} min`;
    const diffHour = Math.floor(diffMin / 60);
    if (diffHour < 24) return `${diffHour} hr`;
    return this.absoluteTime(isoString);
  },

  // Format file size
  fileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  },

  // Generate 4-digit random string
  randomTag() {
    return Math.floor(1000 + Math.random() * 9000).toString();
  }
};
