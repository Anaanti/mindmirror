// Import the functions you need from the SDKs you need
import { getAuth } from "firebase/auth";
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyAV8Av4kptsgD6QCufXkUOBXJotDTU9OUE",
  authDomain: "mindmirror-de863.firebaseapp.com",
  projectId: "mindmirror-de863",
  storageBucket: "mindmirror-de863.firebasestorage.app",
  messagingSenderId: "559121035366",
  appId: "1:559121035366:web:f865e5cf03b91754ce3da7",
  measurementId: "G-1KMXS355XE"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
export const auth = getAuth(app);