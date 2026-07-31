export const firebaseConfig = Object.freeze({
  apiKey: "AIzaSyBrkPmmmT9yiYbaUPpk6RIv21I8bvPV9bA",
  authDomain: "arvelcustomy2k.firebaseapp.com",
  projectId: "arvelcustomy2k",
  storageBucket: "arvelcustomy2k.firebasestorage.app",
  appId: "1:1026669426612:web:c93393b4ff9d034adba4e1"
});

export const firebaseConfigured = Object.values(firebaseConfig).every(
  (value) => value && !value.includes("PEGA_AQUI") && !value.includes("TU_")
);
