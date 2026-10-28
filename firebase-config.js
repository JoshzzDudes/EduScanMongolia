// Firebase web app settings: Firebase console → Project settings → General → Your apps → Web app → firebaseConfig.
// These values identify the project; they are public by design and are not passwords. Access to each teacher's
// data is protected by the Firestore rules (each signed-in teacher reads and writes only users/{own uid}).
// Leave as null to run without accounts (data stays on the device).
window.EDU_FIREBASE_CONFIG = null;
