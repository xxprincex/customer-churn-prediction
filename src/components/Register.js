import { useRef, useState, useEffect } from "react";
import { motion } from "framer-motion";
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
import { auth, db } from "../firebase";
import { setDoc, doc } from "firebase/firestore";
import { toast } from "react-toastify";
// Removed import of deleted Validate.js file

const pageVariants = {
  initial: {
    opacity: 0,
    x: 200,
    scale: 0.95,
  },
  in: {
    opacity: 1,
    x: 0,
    scale: 1,
  },
  out: {
    opacity: 0,
    x: -200,
    scale: 0.95,
  },
};

const pageTransition = {
  type: "tween",
  ease: "anticipate",
  duration: 0.5,
};

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

  // Inline validation function
  const validateForm = (firstname, lastname, email, password) => {
    const nameRegex = /^[a-zA-Z\s-'.]+$/;

    if (
      !firstname ||
      !nameRegex.test(firstname) ||
      firstname.trim().length < 2
    ) {
      return "First name is not valid (min 2 characters, no numbers/special characters)";
    }
    if (!lastname || !nameRegex.test(lastname) || lastname.trim().length < 2) {
      return "Last name is not valid (min 2 characters, no numbers/special characters)";
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return "Please enter a valid email address";
    }
    if (!password || password.length < 6) {
      return "Password must be at least 6 characters long";
    }
    return null;
  };

  useEffect(() => {
    if (firstname && lastname && email && password) {
      const message = validateForm(firstname, lastname, email, password);
      setErrorMessage(message);
      setValid(message === null);
    } else {
      setValid(false);
    }
  }, [firstname, lastname, email, password]);

  const handleRegister = async (event) => {
    event.preventDefault();

    const message = validateForm(firstname, lastname, email, password);
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
    <div className="min-h-screen pt-48 pb-48 flex justify-center overflow-hidden">
      {showSuccess && (
        <div className="fixed inset-0 flex items-center justify-center z-50">
          {/* Backdrop with blur */}
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm"></div>

          {/* Modal */}
          <motion.div
            initial={{ y: -50 }}
            animate={{ y: 0 }}
            transition={{ type: "spring", damping: 15 }}
            className="relative bg-white/90 backdrop-blur-md rounded-2xl p-8 max-w-md w-full mx-4 shadow-xl border border-white/20 transform transition-all"
          >
            <div className="relative z-10">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.2, type: "spring", damping: 10 }}
                className="flex justify-center"
              >
                <FaCheckCircle className="text-green-500 text-6xl mb-4" />
              </motion.div>
              <motion.h2
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="text-2xl font-bold mb-2 text-center"
              >
                Registration Successful!
              </motion.h2>
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.4 }}
                className="text-gray-600 text-center mb-4"
              >
                A verification email has been sent to
                <br />
                <span className="font-medium">{email}</span>
              </motion.p>
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 }}
                className="text-gray-500 text-sm text-center mt-4"
              >
                Redirecting to login page...
              </motion.p>
            </div>
          </motion.div>
        </div>
      )}
      <motion.div
        initial="initial"
        animate="in"
        exit="out"
        variants={pageVariants}
        transition={pageTransition}
        className="relative bg-white shadow-2xl rounded-lg p-14 w-160"
      >
        <motion.h1
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="text-3xl font-sans font-bold text-center"
        >
          Register
        </motion.h1>
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: "80px" }}
          transition={{ delay: 0.3 }}
          className="border-b-4 rounded-full border-black w-20 mx-auto my-2"
        />

        <motion.form
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          onSubmit={handleRegister}
          className="space-y-6 mt-4"
        >
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
        </motion.form>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="text-center mt-4 text-gray-600"
        >
          Already have account? {""}
          <span className="text-blue-600 hover:underline cursor-pointer">
            <Link to="/Login">Login</Link>
          </span>
        </motion.p>
      </motion.div>
    </div>
  );
};

export default Register;
