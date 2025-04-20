// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyBSmMst-4vpZqrbQG01oD04Y0MaDr2NTSo",
  authDomain: "customer-churn-predictio-4b31b.firebaseapp.com",
  projectId: "customer-churn-predictio-4b31b",
  storageBucket: "customer-churn-predictio-4b31b.appspot.com",
  messagingSenderId: "1007983215814",
  appId: "1:1007983215814:web:99c29afd8dfad6cca8c3c7",
  measurementId: "G-MVC0J5B6EE",
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

export const auth = getAuth();
export const db = getFirestore(app);
export default app;
