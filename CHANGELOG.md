# Orbit Beta - Changelog

## [0.0.1-beta] - SQLite Migration Update

**✨ New Features & Improvements**
*   **Database Engine Overhaul**: Entirely stripped out the brittle, memory-heavy `electron-store` JSON files and replaced them with a lightning-fast, persistent SQLite relational database.
*   **Custom Network Protocols**: Implemented native `orbit-db://` and `orbit-file://` internal protocols. Your application no longer tries to load raw paths from your hard drive via the UI, bypassing massive security bottlenecks.
*   **Immutable File Storage**: Media attachments are now ingested as direct binary BLOBs straight into the SQLite database. Your images are immune to accidental file deletions on your hard drive!
*   **Intelligent Auto-Migration**: Added a robust legacy fallback. Beta testers updating to this version will have their old JSON chat histories and friend lists automatically beamed into the new database without losing a single message.
*   **Session Persistence**: The UI is now fully state-aware. It remembers exactly which friend's chat you were actively viewing when you closed the app.

**🐛 Bug Fixes**
*   **Fixed Image Expired Bug**: Resolved a critical defect where images would display "Image Expired / Not Found" after an app restart. Since they are now piped natively from the SQL database, they load perfectly 100% of the time.
*   **Fixed DevTools CSP Blocking**: Resolved aggressive Content Security Policy blockades by whitelisting our new custom protocols, allowing anime avatars and shared images to render effortlessly.
*   **Restored Anime Avatars**: Fixed a strict typing bug during the JSON-to-SQL data migration that was temporarily destroying user profile avatars, restoring both your avatar and Orbit Echo's.
