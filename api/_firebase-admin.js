const { cert, getApps, initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore } = require("firebase-admin/firestore");

function privateKey() {
  return String(process.env.FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY || "")
    .replace(/^['"]|['"]$/g, "")
    .replace(/\\n/g, "\n");
}

function getAdminApp() {
  if (getApps().length) return getApps()[0];
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_SERVICE_ACCOUNT_EMAIL;
  const key = privateKey();
  if (!projectId || !clientEmail || !key) throw new Error("Faltan credenciales privadas de Firebase.");
  return initializeApp({
    credential: cert({ projectId, clientEmail, privateKey: key }),
    projectId
  });
}

async function verifyFirebaseUser(req) {
  const match = String(req.headers.authorization || "").match(/^Bearer\s+(.+)$/i);
  if (!match) throw new Error("AUTH_REQUIRED");
  return getAuth(getAdminApp()).verifyIdToken(match[1], true);
}

module.exports = {
  getAdminDb: () => getFirestore(getAdminApp()),
  verifyFirebaseUser
};
