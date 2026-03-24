import * as admin from 'firebase-admin';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Initialize Firebase Admin SDK
 * Uses service account key file from project root
 */
function initializeFirebase() {
  if (admin.apps.length > 0) {
    return admin.app();
  }

  // Find service account key file
  const projectRoot = process.cwd();
  const files = fs.readdirSync(projectRoot);
  const serviceAccountFile = files.find(
    (f) => f.includes('firebase-adminsdk') && f.endsWith('.json'),
  );

  if (!serviceAccountFile) {
    console.warn(
      'Firebase: No service account key found. FCM push notifications will be disabled.',
    );
    return null;
  }

  const serviceAccountPath = path.join(projectRoot, serviceAccountFile);
  const serviceAccount = JSON.parse(
    fs.readFileSync(serviceAccountPath, 'utf-8'),
  );

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });

  console.log('Firebase Admin SDK initialized successfully');
  return admin.app();
}

// Initialize on module load
const firebaseApp = initializeFirebase();

export { admin, firebaseApp };
