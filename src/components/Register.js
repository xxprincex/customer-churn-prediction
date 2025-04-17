import { useRef, useState, useEffect } from "react";
import {
  FaUser,
  FaLock,
  FaEnvelope,
  FaCheckCircle,
  FaSpinner,
  FaEye,
  FaEyeSlash,
} from "react-icons/fa";
import { Link } from "react-router-dom";
import {
  createUserWithEmailAndPassword,
  sendEmailVerification,
} from "firebase/auth";
import { auth, db } from "./firebase";
import { setDoc, doc } from "firebase/firestore";
import { toast } from "react-toastify";
import { checkValidation } from "../utils/Validate";

const Register = () => {
  const [firstname, setFirstname] = useState("");
  const [lastname, setLastname] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isValid, setValid] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  const firstname1 = useRef(null);
  const lastname1 = useRef(null);
  const email1 = useRef(null);
  const password1 = useRef(null);

  useEffect(() => {
    if (firstname && lastname && email && password) {
      const message = checkValidation(firstname, lastname, email, password);
      setErrorMessage(message);
      setValid(message === null);
    } else {
      setValid(false);
    }
  }, [firstname, lastname, email, password]);

  const handleRegister = async (event) => {
    event.preventDefault();

    const message = checkValidation(firstname, lastname, email, password);
    if (message !== null) {
      setErrorMessage(message);
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        email,
        password
      );
      const user = userCredential.user;

      if (user) {
        try {
          // Send email verification with custom settings
          const actionCodeSettings = {
            url: window.location.origin + "/login",
            handleCodeInApp: true,
          };

          await sendEmailVerification(user, actionCodeSettings);

          // Store user data in Firestore with current timestamp
          const createdAt = new Date().toISOString();
          await setDoc(doc(db, "Users", user.uid), {
            email: user.email,
            firstName: firstname,
            lastName: lastname,
            emailVerified: false,
            createdAt,
            verificationAttempts: 1,
          });

          setShowSuccess(true);
          toast.success("Verification email sent! Please check your email.", {
            position: "top-center",
            autoClose: 3000,
          });

          // Sign out the user after registration
          await auth.signOut();

          // Redirect to signin page after 2 seconds
          setTimeout(() => {
            window.location.href = "/Login";
          }, 2000);
        } catch (verificationError) {
          console.error("Verification error:", verificationError);
          toast.error("Error sending verification email. Please try again.", {
            position: "top-center",
            autoClose: 3000,
          });
          // Clean up the created account if verification fails
          await user.delete();
        }
      }
    } catch (error) {
      console.error("Registration error:", error);
      let errorMsg = "An error occurred during registration. Please try again.";

      if (error.code === "auth/email-already-in-use") {
        errorMsg =
          "This email is already registered. Please use a different email or sign in.";
      } else if (error.code === "auth/invalid-email") {
        errorMsg = "Invalid email address. Please check your email format.";
      } else if (error.code === "auth/weak-password") {
        errorMsg = "Password is too weak. Please use a stronger password.";
      }

      toast.error(errorMsg, {
        position: "top-center",
        autoClose: 2000,
      });
      setErrorMessage(errorMsg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen pt-48 pb-48 flex justify-center">
      {showSuccess && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 animate-scaleIn">
          <div className="bg-white rounded-lg p-8 flex flex-col items-center max-w-md">
            <FaCheckCircle className="text-green-500 text-6xl mb-4" />
            <h2 className="text-2xl font-bold mb-2">
              Registration Successful!
            </h2>
            <p className="text-gray-600 text-center mb-4">
              A verification email has been sent to {email}
            </p>
            <p className="text-gray-500 text-sm mt-4">
              Redirecting to login page...
            </p>
          </div>
        </div>
      )}
      <div className="relative bg-white shadow-2xl rounded-lg p-14 w-160">
        <h1 className="text-3xl font-sans font-bold text-center">Register</h1>
        <div className="border-b-4 rounded-full border-black w-20 mx-auto my-2"></div>

        <form onSubmit={handleRegister} className="space-y-6 mt-4">
          <div className="relative flex justify-center ">
            <FaUser className="absolute left-19 top-1/2 transform -translate-y-1/2 text-gray-500" />
            <input
              ref={firstname1}
              type="text"
              value={firstname}
              onChange={(e) => setFirstname(e.target.value)}
              placeholder="First name"
              className="w-100 py-1 px-4 pl-10 pr-3 border-b-2 outline-none focus:border-black"
              required
            />
          </div>
          <div className="relative  flex  justify-center">
            <FaUser className="absolute left-19 top-1/2 transform -translate-y-1/2 text-gray-500" />
            <input
              ref={lastname1}
              type="text"
              value={lastname}
              onChange={(e) => setLastname(e.target.value)}
              placeholder="Last name"
              className="w-100 py-1 px-4 pl-10 pr-3 border-b-2 outline-none focus:border-black"
              required
            />
          </div>

          <div className="relative  flex  justify-center">
            <FaEnvelope className="absolute left-19 top-1/2 transform -translate-y-1/2 text-gray-500" />
            <input
              ref={email1}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              className="w-100 py-1 px-4 pl-10 pr-3 border-b-2 outline-none focus:border-black"
              required
            />
          </div>
          <div className="relative flex justify-center">
            <FaLock className="absolute left-19 top-1/2 transform -translate-y-1/2 text-gray-500" />
            <input
              ref={password1}
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              className="w-100 py-1 px-4 pl-10 pr-10 border-b-2 outline-none focus:border-black"
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-19 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-700 focus:outline-none"
            >
              {showPassword ? <FaEyeSlash /> : <FaEye />}
            </button>
          </div>
          <p className="text-red-500 text-center font-medium">{errorMessage}</p>
          <div className="flex justify-center">
            <button
              className="w-100 bg-black text-white py-2 rounded-full font-medium hover:scale-105 transition-transform ease-in-out disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 flex items-center justify-center"
              type="submit"
              disabled={!isValid || isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <FaSpinner className="animate-spin mr-2" />
                  Registering...
                </>
              ) : (
                "Register"
              )}
            </button>
          </div>
        </form>
        <p className="text-center mt-4 text-gray-600">
          Already have account? {""}
          <span className="text-blue-600 hover:underline cursor-pointer">
            <Link to="/Login">Login</Link>
          </span>
        </p>
      </div>
    </div>
  );
};

export default Register;
