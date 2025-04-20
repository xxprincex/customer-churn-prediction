import { useState } from "react";
import { motion } from "framer-motion";
import {
  FaLock,
  FaEnvelope,
  FaSpinner,
  FaEye,
  FaEyeSlash,
} from "react-icons/fa";
import { Link, useNavigate } from "react-router-dom";
import {
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
} from "firebase/auth";
import { auth } from "../firebase";
import { toast } from "react-toastify";

const pageVariants = {
  initial: {
    opacity: 0,
    x: -200,
    scale: 0.95,
  },
  in: {
    opacity: 1,
    x: 0,
    scale: 1,
  },
  out: {
    opacity: 0,
    x: 200,
    scale: 0.95,
  },
};

const pageTransition = {
  type: "tween",
  ease: "anticipate",
  duration: 0.5,
};

const Login = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const navigate = useNavigate();

  const handlePasswordReset = async () => {
    if (!email) {
      toast.error("Please enter your email address");
      return;
    }

    try {
      setIsResettingPassword(true);
      await sendPasswordResetEmail(auth, email);
      toast.success("Password reset email sent!");
    } catch (error) {
      if (error.code === "auth/user-not-found") {
        toast.error("No account found with this email");
      } else if (error.code === "auth/invalid-email") {
        toast.error("Invalid email format");
      } else {
        toast.error("Failed to send reset email");
      }
    } finally {
      setIsResettingPassword(false);
    }
  };

  const handleSignIn = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError("");

    try {
      const { user } = await signInWithEmailAndPassword(auth, email, password);

      if (!user.emailVerified) {
        await signOut(auth);
        setError("Please verify your email to continue");
        return;
      }

      localStorage.setItem(
        "user",
        JSON.stringify({
          uid: user.uid,
          email: user.email,
          displayName: user.displayName,
        })
      );

      toast.success("Login successful!");
      navigate("/Account");
    } catch (error) {
      if (error.code === "auth/user-not-found") {
        setError("No account registered with this email. Register now!");
      } else if (
        error.code === "auth/wrong-password" ||
        error.code === "auth/invalid-credential"
      ) {
        setError("Incorrect password. Reset password?");
        toast.error("Incorrect password. Reset password?");
      } else {
        setError(error.message);
        toast.error(error.message);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen pt-48 pb-64 flex justify-center overflow-hidden">
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
          Login
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
          onSubmit={handleSignIn}
          className="space-y-6 mt-4"
        >
          <div className="relative flex justify-center">
            <FaEnvelope className="absolute left-19 top-1/2 transform -translate-y-1/2 text-gray-500" />
            <input
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

          {error && (
            <div className="text-red-500 text-sm text-center">
              {error.includes("Incorrect password")
                ? "Incorrect password"
                : error}
            </div>
          )}

          <div className="flex justify-center">
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-100 bg-black text-white py-2 rounded-full font-medium hover:scale-105 transition-transform ease-in-out disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 flex items-center justify-center"
            >
              {isSubmitting ? (
                <>
                  <FaSpinner className="animate-spin mr-2" />
                  Logging in...
                </>
              ) : (
                "Login"
              )}
            </button>
          </div>
        </motion.form>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="text-center mt-4 space-y-2"
        >
          <p className="text-gray-600">
            Don't have an account?{" "}
            <Link to="/Register" className="text-blue-600 hover:underline">
              Register
            </Link>
          </p>
          <button
            type="button"
            onClick={handlePasswordReset}
            disabled={isResettingPassword}
            className="text-sm text-gray-500 hover:text-blue-600"
          >
            {isResettingPassword ? (
              <span className="flex items-center justify-center">
                <FaSpinner className="animate-spin mr-1" />
                Sending reset link...
              </span>
            ) : (
              "Forgot password?"
            )}
          </button>
        </motion.div>
      </motion.div>
    </div>
  );
};

export default Login;
