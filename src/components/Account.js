import { useEffect, useState, useMemo, useRef } from "react";
import { auth, db } from "../firebase";
import {
  getDoc,
  doc,
  collection,
  getDocs,
  query,
  orderBy,
  updateDoc,
  writeBatch,
  deleteDoc,
} from "firebase/firestore";
import {
  signOut,
  deleteUser,
  EmailAuthProvider,
  reauthenticateWithCredential,
} from "firebase/auth";
import { useNavigate, useLocation } from "react-router-dom";
import { toast } from "react-toastify";
import { Info } from "lucide-react";

// Update the gold shine styles
const goldShineStyles = `
  .premium-gold-card {
    background: linear-gradient(135deg, #fdf6e5 0%, #fff6d5 50%, #fff2c2 100%);
    position: relative;
    overflow: hidden;
    box-shadow: 0 10px 30px -5px rgba(189, 161, 61, 0.2);
    backdrop-filter: blur(10px);
    border: 1px solid rgba(255, 255, 255, 0.2);
  }
  
  .premium-card-shine {
    position: absolute;
    top: 0;
    left: -100%;
    width: 200%;
    height: 100%;
    background: linear-gradient(
      90deg,
      transparent,
      rgba(255, 255, 255, 0.2),
      transparent
    );
    animation: shine 3s infinite;
  }

  .trial-card {
    background: linear-gradient(135deg, #60a5fa 0%, #3b82f6 50%, #2563eb 100%);
    position: relative;
    overflow: hidden;
  }

  .trial-card-shine {
    position: absolute;
    top: 0;
    left: -100%;
    width: 200%;
    height: 100%;
    background: linear-gradient(
      90deg,
      transparent,
      rgba(255, 255, 255, 0.1),
      transparent
    );
    animation: shine 3s infinite;
  }

  .free-card {
    background: linear-gradient(135deg, #f3f4f6 0%, #ffffff 50%, #f9fafb 100%);
    position: relative;
    overflow: hidden;
  }

  .feature-card {
    transform: translateY(0);
    transition: all 0.3s ease;
  }

  .feature-card:hover {
    transform: translateY(-5px);
  }

  .feature-icon {
    transition: all 0.3s ease;
  }

  .feature-card:hover .feature-icon {
    transform: scale(1.1);
  }

  .countdown-ring {
    position: relative;
    width: 120px;
    height: 120px;
  }

  .countdown-circle {
    transform: rotate(-90deg);
    transform-origin: 50% 50%;
  }

  .price-tag {
    position: relative;
    display: inline-block;
  }

  .price-tag::before {
    content: '';
    position: absolute;
    top: 50%;
    left: -20px;
    width: 40px;
    height: 40px;
    background: rgba(255, 215, 0, 0.1);
    border-radius: 50%;
    transform: translateY(-50%);
    z-index: -1;
  }

  @keyframes shine {
    0% {
      left: -100%;
    }
    20% {
      left: 100%;
    }
    100% {
      left: 100%;
    }
  }

  @keyframes float {
    0% {
      transform: translateY(0px);
    }
    50% {
      transform: translateY(-10px);
    }
    100% {
      transform: translateY(0px);
    }
  }

  .floating {
    animation: float 3s ease-in-out infinite;
  }
`;

// Add this helper at the top-level of the component
const formatDisplayDate = (date) => {
  if (!date) return "N/A";
  if (typeof date === "string") {
    const d = new Date(date);
    if (!isNaN(d)) return d.toLocaleDateString("en-IN");
  }
  if (date instanceof Date) return date.toLocaleDateString("en-IN");
  if (date.toDate) return date.toDate().toLocaleDateString("en-IN");
  return "Invalid Date";
};

// Add this helper at the top-level of the component
const getDateObj = (val) => {
  if (!val) return null;
  if (val instanceof Date) return val;
  if (typeof val === "string") {
    const d = new Date(val);
    if (!isNaN(d)) return d;
  }
  if (val.toDate) return val.toDate();
  return null;
};

// Add these new components for enhanced features
const FeatureCard = ({ icon, title, description }) => (
  <div className="feature-card bg-white rounded-xl p-4 shadow-sm hover:shadow-lg transition-all duration-300">
    <div className="flex items-start gap-3">
      <div className="feature-icon bg-yellow-100 rounded-full p-2 mt-0.5">
        {icon}
      </div>
      <div>
        <h4 className="font-semibold text-gray-800">{title}</h4>
        <p className="text-gray-600 text-sm">{description}</p>
      </div>
    </div>
  </div>
);

const CountdownRing = ({ days, total = 7 }) => {
  const percentage = (days / total) * 100;
  const circumference = 2 * Math.PI * 38; // radius = 38
  const offset = circumference - (percentage / 100) * circumference;

  return (
    <div className="countdown-ring">
      <svg
        className="countdown-circle"
        width="120"
        height="120"
        viewBox="0 0 120 120"
      >
        <circle
          cx="60"
          cy="60"
          r="38"
          stroke="#e5e7eb"
          strokeWidth="8"
          fill="none"
        />
        <circle
          cx="60"
          cy="60"
          r="38"
          stroke="#fbbf24"
          strokeWidth="8"
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-bold text-yellow-600">{days}</span>
        <span className="text-sm text-gray-600">days left</span>
      </div>
    </div>
  );
};

// Simplified Tooltip component that works reliably
const Tooltip = ({ children, content }) => {
  const [show, setShow] = useState(false);
  const timeoutRef = useRef(null);
  const tooltipRef = useRef(null);

  const handleMouseEnter = () => {
    timeoutRef.current = setTimeout(() => {
      setShow(true);
    }, 500);
  };

  const handleMouseLeave = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    setShow(false);
  };

  return (
    <div className="relative inline-block">
      <div
        ref={tooltipRef}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {children}
        {show && (
          <div className="absolute z-[9999] bottom-full left-1/2 transform -translate-x-1/3 mb-2">
            <div className="bg-white px-3 py-2 rounded-lg shadow-lg border border-gray-200 text-sm text-gray-800 whitespace-nowrap">
              {content}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// 1. Add new styles for trial and premium cards (add to goldShineStyles)
const enhancedTierStyles = `
  .trial-gradient {
    background: linear-gradient(135deg, #60a5fa 0%, #6366f1 50%, #a21caf 100%);
    position: relative;
    overflow: hidden;
    box-shadow: 0 10px 30px -5px rgba(99,102,241,0.15);
    border: 1px solid rgba(99,102,241,0.08);
  }
  .trial-shine {
    position: absolute;
    top: 0;
    left: -100%;
    width: 200%;
    height: 100%;
    background: linear-gradient(90deg, transparent, rgba(255,255,255,0.12), transparent);
    animation: shine 2.5s infinite;
  }
  .trial-floating-badge {
    animation: float 2.5s ease-in-out infinite;
    filter: drop-shadow(0 2px 8px #6366f1cc);
  }
  .premium-gold-gradient {
    background: linear-gradient(135deg, #fffbe6 0%, #ffe082 50%, #ffd700 100%);
    position: relative;
    overflow: hidden;
    box-shadow: 0 10px 30px -5px rgba(189,161,61,0.25);
    border: 1px solid rgba(255,215,0,0.12);
  }
  .premium-gold-shine {
    position: absolute;
    top: 0;
    left: -100%;
    width: 200%;
    height: 100%;
    background: linear-gradient(90deg, transparent, rgba(255,255,255,0.18), transparent);
    animation: shine 2.5s infinite;
  }
  .premium-floating-crown {
    animation: float 2.5s ease-in-out infinite;
    filter: drop-shadow(0 2px 8px #ffd700cc);
  }
  .premium-sparkle {
    position: absolute;
    pointer-events: none;
    animation: sparkle 2.5s infinite alternate;
  }
  @keyframes sparkle {
    0% { opacity: 0.7; transform: scale(1) translateY(0); }
    100% { opacity: 1; transform: scale(1.2) translateY(-8px); }
  }
`;

// Add spiral/glossy border styles at the top (append to enhancedTierStyles)
const spiralPremiumStyles = `
  .premium-spiral-border {
    position: relative;
    border-radius: 1.5rem;
    padding: 6px;
    background: conic-gradient(from 0deg, #fffbe6 0%, #ffe082 30%, #ffd700 60%, #fffbe6 100%);
    box-shadow: 0 8px 32px 0 rgba(189,161,61,0.18), 0 1.5px 8px 0 rgba(255,215,0,0.10);
    overflow: visible;
  }
  .premium-spiral-border::before {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: 1.5rem;
    padding: 0;
    z-index: 1;
    pointer-events: none;
    background: repeating-conic-gradient(from 0deg, #fffbe6 0deg 10deg, #ffd700 10deg 20deg, #fffbe6 20deg 30deg);
    opacity: 0.18;
  }
  .premium-inner-card {
    border-radius: 1.2rem;
    background: rgba(255,255,255,0.95);
    box-shadow: 0 2px 12px 0 rgba(189,161,61,0.08);
    position: relative;
    z-index: 2;
    padding: 2.5rem 2rem 2rem 2rem;
    min-height: 340px;
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  .premium-sparkle {
    position: absolute;
    pointer-events: none;
    animation: sparkle 2.5s infinite alternate;
    z-index: 3;
  }
  .premium-crown {
    position: absolute;
    top: 1.2rem;
    right: 1.5rem;
    z-index: 4;
    filter: drop-shadow(0 2px 8px #ffd700cc);
  }
`;

const PREDICTION_LIMIT_FREE = 20;

// Add the ModernUsageMeter component
const ModernUsageMeter = ({
  userDetails,
  todayPredictionCount,
  maxPredictions = 20,
}) => {
  const remainingPredictions = maxPredictions - todayPredictionCount;
  const usagePercentage = (todayPredictionCount / maxPredictions) * 100;

  if (userDetails?.subscriptionPlan !== "free") return null;

  return (
    <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-lg border border-blue-200 mb-4">
      {/* Info Icon */}
      <div className="flex-shrink-0">
        <div className="w-5 h-5 bg-blue-600 rounded-full flex items-center justify-center">
          <Info className="w-3 h-3 text-white" />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Header and Stats in one line */}
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-blue-800 font-medium text-sm truncate">
            {remainingPredictions === 0
              ? "Daily limit reached"
              : remainingPredictions <= 3
                ? "Almost at limit"
                : "Daily Usage"}
          </h3>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="text-xs font-semibold text-blue-800">
              {todayPredictionCount}/{maxPredictions}
            </span>
            <div className="flex items-center gap-1 text-blue-700 bg-blue-100 px-1.5 py-0.5 rounded text-xs">
              <div
                className={`w-1.5 h-1.5 rounded-full ${remainingPredictions > 0 ? "bg-green-500" : "bg-red-500"}`}
              ></div>
              <span className="font-medium">{remainingPredictions} left</span>
            </div>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="relative h-1.5 bg-blue-200 rounded-full overflow-hidden mb-1">
          <div
            className={`absolute left-0 top-0 h-full rounded-full transition-all duration-500 ease-out ${
              usagePercentage >= 90
                ? "bg-gradient-to-r from-red-500 to-red-600"
                : "bg-gradient-to-r from-blue-600 to-blue-700"
            }`}
            style={{ width: `${usagePercentage}%` }}
          ></div>
        </div>

        {/* Compact description */}
        <p className="text-blue-700 text-xs leading-tight">
          {remainingPredictions === 0
            ? "Upgrade to Gold for unlimited predictions"
            : remainingPredictions <= 3
              ? "Consider upgrading for unlimited access"
              : "Free plan • Resets at midnight"}
        </p>
      </div>
    </div>
  );
};

const Account = () => {
  const [userDetails, setUserDetails] = useState(null);
  const [predictions, setPredictions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isActivating, setIsActivating] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  // Add these state variables after other useState declarations
  const [isEditing, setIsEditing] = useState(false);
  const [editedInfo, setEditedInfo] = useState({
    firstName: "",
    lastName: "",
  });
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [password, setPassword] = useState("");
  const [reAuthError, setReAuthError] = useState("");
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(false);
  const [showBatchHistory, setShowBatchHistory] = useState(false);
  const [todayPredictionCount, setTodayPredictionCount] = useState(0);

  // Add this after other state declarations
  const [batchPredictions, setBatchPredictions] = useState([]);
  const [loadingBatch, setLoadingBatch] = useState(false);
  const [showPredictions, setShowPredictions] = useState(false);
  const [searchCustomerId, setSearchCustomerId] = useState("");
  const [dateRange, setDateRange] = useState({
    startDate: "",
    endDate: "",
  });

  // Filter predictions based on search and date range
  const filteredPredictions = useMemo(() => {
    return predictions.filter((pred) => {
      const matchesSearch = searchCustomerId
        ? pred.formData?.CustomerID?.toLowerCase().includes(
            searchCustomerId.toLowerCase()
          )
        : true;

      const predDate = new Date(pred.date);
      const startDate = dateRange.startDate
        ? new Date(dateRange.startDate)
        : null;
      const endDate = dateRange.endDate ? new Date(dateRange.endDate) : null;

      const withinDateRange =
        (!startDate || predDate >= startDate) &&
        (!endDate || predDate <= endDate);

      return matchesSearch && withinDateRange;
    });
  }, [predictions, searchCustomerId, dateRange]);

  // Add useEffect for handling body scroll
  useEffect(() => {
    if (showDeleteConfirm) {
      // Prevent scrolling on the body when modal is open
      document.body.style.overflow = "hidden";
    } else {
      // Re-enable scrolling when modal is closed
      document.body.style.overflow = "unset";
    }

    // Cleanup function to re-enable scrolling when component unmounts
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [showDeleteConfirm]);

  // Add auto-save toggle handler
  const handleAutoSaveToggle = async () => {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        toast.error("Please login to change settings");
        return;
      }

      const userRef = doc(db, "Users", currentUser.uid);
      const userDoc = await getDoc(userRef);

      if (!userDoc.exists()) {
        toast.error("User profile not found");
        return;
      }

      const userData = userDoc.data();
      if (userData.subscriptionPlan !== "gold") {
        toast.error(
          "Auto-save settings are only available for Gold subscribers"
        );
        return;
      }

      const newAutoSaveValue = !autoSaveEnabled;

      await updateDoc(userRef, {
        autoSaveEnabled: newAutoSaveValue,
        lastUpdated: new Date(),
      });

      setAutoSaveEnabled(newAutoSaveValue);
      toast.success(`Auto-save ${newAutoSaveValue ? "enabled" : "disabled"}`);
    } catch (error) {
      console.error("Error updating auto-save setting:", error);
      toast.error("Failed to update auto-save setting");
    }
  };

  const fetchPredictionHistory = async () => {
    setLoading(true);
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        return null;
      }

      const predictionsRef = collection(
        db,
        "Users",
        currentUser.uid,
        "predictions"
      );
      const q = query(predictionsRef, orderBy("timestamp", "desc"));
      const querySnapshot = await getDocs(q);

      const predictionData = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        predictionData.push({
          id: doc.id,
          ...data,
          date: data.timestamp
            ? formatDisplayDate(data.timestamp.toDate())
            : "Unknown date",
        });
      });

      setPredictions(predictionData);
    } catch (error) {
      console.error("Error fetching prediction history:", error);
    } finally {
      setLoading(false);
    }
  };

  const togglePredictionHistory = () => {
    if (!showPredictions) {
      fetchPredictionHistory();
    }
    setShowPredictions(!showPredictions);
  };

  const activateGoldPlan = async (sessionId) => {
    try {
      setIsActivating(true);
      const currentUser = auth.currentUser;
      if (!currentUser) {
        return null;
      }

      console.log("Activating Gold plan for user:", currentUser.uid);
      console.log("Session ID:", sessionId);

      const userRef = doc(db, "Users", currentUser.uid);
      const userDoc = await getDoc(userRef);

      if (!userDoc.exists()) {
        throw new Error("User document not found");
      }

      // Wait for webhook to update the subscription status
      let attempts = 0;
      const maxAttempts = 10;

      while (attempts < maxAttempts) {
        const updatedDoc = await getDoc(userRef);
        const userData = updatedDoc.data();

        if (userData.subscriptionPlan === "gold") {
          toast.success(
            "🌟 Welcome to Gold Plan! Your premium features are now active."
          );
          return;
        }

        await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait 1 second
        attempts++;
      }

      throw new Error("Subscription status not updated after payment");
    } catch (error) {
      console.error("Error activating Gold plan:", error);
      toast.error(
        "There was an issue activating your subscription. Please contact support."
      );
    } finally {
      setIsActivating(false);
    }
  };

  // Handle activation on mount and URL changes
  useEffect(() => {
    const handleActivation = async () => {
      const params = new URLSearchParams(window.location.search);
      const sessionId = params.get("session_id");
      const success = params.get("success");

      if (success === "true" && sessionId) {
        console.log("Found successful payment with session ID:", sessionId);
        await activateGoldPlan(sessionId);
      }
    };

    handleActivation();
  }, [location.search]); // Changed dependency to location.search

  // Add helper function to calculate trial end date (1 week)
  const calculateTrialEndDate = (startDate) => {
    const date = new Date(startDate);
    date.setDate(date.getDate() + 7); // 7 days trial
    return date;
  };

  // Update startTrial to set only subscriptionPlan, trialUsed, trialEndDate
  const startTrial = async () => {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        toast.error("Please login to start your trial");
        navigate("/login");
        return;
      }
      const userRef = doc(db, "Users", currentUser.uid);
      const now = new Date();
      const trialEnd = new Date(now);
      trialEnd.setDate(now.getDate() + 7); // 7 days trial
      const updateData = {
        subscriptionPlan: "trial",
        trialUsed: true,
        trialStartDate: now,
        trialEndDate: trialEnd,
        lastUpdated: now,
      };
      await updateDoc(userRef, updateData);
      setUserDetails((prev) => ({ ...prev, ...updateData }));
      toast.success("🎉 Trial started! Enjoy premium features for 1 week.");
    } catch (error) {
      console.error("Error starting trial:", error);
      toast.error("Could not start trial. Please try again.");
    }
  };

  const handlePremiumUpgrade = async () => {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        toast.error("Please login to upgrade");
        navigate("/login");
        return;
      }

      setIsProcessing(true);

      // Add success_url parameter, customer email, and client_reference_id to redirect URL
      const successUrl = `${window.location.origin}/account?success=true`;
      const paymentLink = "https://buy.stripe.com/test_14k14BbYP3iQfPa4gg";
      const finalPaymentLink = `${paymentLink}?success_url=${encodeURIComponent(successUrl)}&prefilled_email=${encodeURIComponent(currentUser.email)}&client_reference_id=${encodeURIComponent(currentUser.uid)}`;

      console.log("Payment link with user ID:", finalPaymentLink);
      console.log("User ID being passed:", currentUser.uid);

      // Redirect to Stripe payment link
      window.location.href = finalPaymentLink;
    } catch (error) {
      console.error("Error initiating upgrade:", error);
      toast.error("Could not process upgrade. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  };

  // Add this function to format dates
  const formatDate = (date) => {
    if (!date) return "N/A";
    if (date instanceof Date) {
      return date.toLocaleDateString("en-IN", {
        day: "numeric",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    }
    // Handle Firestore Timestamp
    if (date.toDate) {
      return date.toDate().toLocaleDateString("en-IN", {
        day: "numeric",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    }
    return "Invalid Date";
  };

  // Add this helper function at the top
  const calculateExpiryDate = (startDate) => {
    const date = new Date(startDate);
    date.setMonth(date.getMonth() + 1);
    // Handle edge cases for months with different days
    if (date.getDate() !== new Date(startDate).getDate()) {
      date.setDate(0); // Set to last day of previous month
    }
    return date;
  };

  // Update checkPaymentStatus to be more resilient
  const checkPaymentStatus = async (sessionId) => {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) return;

      const urlParams = new URLSearchParams(window.location.search);
      const success = urlParams.get("success");

      if (success === "true") {
        console.log("Payment successful, updating subscription status...");

        const userRef = doc(db, "Users", currentUser.uid);
        const now = new Date();
        const subscriptionEndDate = new Date(now);
        subscriptionEndDate.setMonth(now.getMonth() + 1);

        const updateData = {
          subscriptionPlan: "gold",
          subscriptionStartDate: now,
          subscriptionEndDate: subscriptionEndDate,
          lastUpdated: now,
          trialEndDate: null,
          trialStartDate: null,
        };

        await updateDoc(userRef, updateData);
        setUserDetails((prev) => ({ ...prev, ...updateData }));

        toast.success(
          "🌟 Welcome to Gold Plan! Your premium features are now active."
        );

        // Clear URL parameters
        window.history.replaceState(
          {},
          document.title,
          window.location.pathname
        );
      }
    } catch (error) {
      console.error("Error checking payment status:", error);
      toast.error(
        "There was an issue activating your subscription. Please contact support."
      );
    }
  };

  // Update the useEffect hook for payment status check
  useEffect(() => {
    const checkPayment = async () => {
      // Check if we have a session ID in either hash or search params
      const hashParams = new URLSearchParams(window.location.hash.substring(1));
      const urlParams = new URLSearchParams(window.location.search);
      const sessionId =
        hashParams.get("cs_test") || urlParams.get("session_id");

      if (sessionId) {
        await checkPaymentStatus();
      }
    };

    if (auth.currentUser) {
      checkPayment();
    }
  }, [location.search, location.hash]); // Run when URL parameters or hash change

  // Add this useEffect to always fetch user data after payment success and show loading spinner until plan is updated
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const success = params.get("success");
    if (success === "true") {
      setIsLoading(true);
      const interval = setInterval(async () => {
        await fetchUserData();
        // If user is now gold, stop polling and remove ?success from URL
        if (userDetails?.subscriptionPlan === "gold") {
          setIsLoading(false);
          window.history.replaceState(
            {},
            document.title,
            window.location.pathname
          );
          clearInterval(interval);
        }
      }, 2000); // Poll every 2 seconds
      // Cleanup
      return () => clearInterval(interval);
    }
  }, [window.location.search, userDetails?.subscriptionPlan]);

  // Update fetchUserData to set a default subscriptionPlan ('free') if missing
  const fetchUserData = async () => {
    try {
      const currentUser = auth.currentUser;
      if (currentUser) {
        const docRef = doc(db, "Users", currentUser.uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const userData = docSnap.data();
          // Set default plan if missing
          if (!userData.subscriptionPlan) {
            userData.subscriptionPlan = "free";
          }
          setUserDetails(userData);
        } else {
          navigate("/login");
        }
      } else {
        setUserDetails(null);
        navigate("/login");
      }
    } catch (error) {
      console.error("Error fetching user data:", error);
      navigate("/login");
    } finally {
      setIsLoading(false);
    }
  };

  const setupAuthListener = () => {
    return auth.onAuthStateChanged((user) => {
      if (user) {
        fetchUserData();
      } else {
        navigate("/login");
      }
    });
  };

  useEffect(() => {
    const unsubscribe = setupAuthListener();
    if (auth.currentUser) {
      fetchUserData();
    }
    return () => {
      unsubscribe();
    };
  }, [navigate]);

  // 2. Inject enhanced styles in useEffect (after goldShineStyles)
  useEffect(() => {
    const styleSheet = document.createElement("style");
    styleSheet.innerText =
      goldShineStyles + enhancedTierStyles + spiralPremiumStyles;
    document.head.appendChild(styleSheet);
    return () => {
      document.head.removeChild(styleSheet);
    };
  }, []);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      navigate("/login");
    } catch (error) {
      console.error("Error logging out", error.message);
    }
  };

  // Update trial expiration logic
  const checkTrialStatus = async (userData) => {
    if (userData.trialEndDate) {
      const trialEnd = getDateObj(userData.trialEndDate);
      if (trialEnd < new Date()) {
        const userRef = doc(db, "Users", auth.currentUser.uid);
        await updateDoc(userRef, {
          subscriptionPlan: "free",
          trialEndDate: null,
          trialStartDate: null,
          lastUpdated: new Date(),
        });
        setUserDetails((prev) => ({
          ...prev,
          subscriptionPlan: "free",
          trialEndDate: null,
          trialStartDate: null,
        }));
        toast.info("Your trial period has ended. Upgrade coming soon!");
      }
    }
  };

  // Update common style classes for consistent sizing
  const cardCommonClasses =
    "p-8 rounded-xl shadow-xl h-[420px] flex flex-col justify-between transform hover:scale-[1.02] transition-all duration-500 backdrop-blur-lg border border-white/20";
  const buttonCommonClasses =
    "w-full rounded-full py-3 px-6 text-lg font-semibold transition-all duration-300 shadow-lg hover:shadow-xl flex items-center justify-center gap-2 transform hover:scale-[1.02]";
  const headingCommonClasses = "text-3xl font-bold mb-6";
  const sectionCommonClasses = "space-y-4";
  const featureCardClasses =
    "bg-white/90 p-4 rounded-lg shadow-md flex items-start gap-3 transform hover:scale-[1.02] transition-all duration-300";
  const badgeClasses =
    "text-white text-lg font-bold mb-6 flex items-center justify-center gap-2 bg-gradient-to-r from-yellow-400 to-yellow-600 py-2 px-6 rounded-full shadow-lg transform hover:scale-105 transition-all duration-300";
  const contentCardClasses =
    "bg-white/90 rounded-lg p-6 shadow-md transform hover:scale-[1.02] transition-all duration-300 mb-6";

  // Add these functions before the return statement
  const handleEditClick = () => {
    if (userDetails) {
      setEditedInfo({
        firstName: userDetails.firstName || "",
        lastName: userDetails.lastName || "",
      });
      setIsEditing(true);
    }
  };

  const handleSaveClick = async () => {
    try {
      const userRef = doc(db, "Users", auth.currentUser.uid);
      await updateDoc(userRef, {
        firstName: editedInfo.firstName,
        lastName: editedInfo.lastName,
        lastUpdated: new Date(),
      });

      setUserDetails((prev) => ({
        ...prev,
        firstName: editedInfo.firstName,
        lastName: editedInfo.lastName,
      }));
      setIsEditing(false);
      toast.success("Profile updated successfully!");
    } catch (error) {
      console.error("Error updating profile:", error);
      toast.error("Failed to update profile. Please try again.");
    }
  };

  const handleDeleteAccount = async () => {
    try {
      setIsProcessing(true);
      setReAuthError("");
      const user = auth.currentUser;
      if (!user) {
        toast.error("No user found to delete");
        return;
      }
      if (!password.trim()) {
        setReAuthError("Please enter your password to confirm deletion");
        toast.error("Please enter your password to confirm deletion");
        setIsProcessing(false);
        return;
      }
      try {
        // Try to re-authenticate user before deletion
        const credential = EmailAuthProvider.credential(user.email, password);
        await reauthenticateWithCredential(user, credential);
      } catch (reAuthError) {
        console.error("Re-authentication failed:", reAuthError);
        setReAuthError("Incorrect password. Please try again.");
        toast.error("Incorrect password. Please try again.");
        setIsProcessing(false);
        return;
      }
      // Delete all predictions and batchPredictions
      const userRef = doc(db, "Users", user.uid);
      const predictionsRef = collection(userRef, "predictions");
      const batchPredictionsRef = collection(userRef, "batchPredictions");
      // Delete predictions
      const predictionsSnapshot = await getDocs(predictionsRef);
      for (const docSnap of predictionsSnapshot.docs) {
        await deleteDoc(docSnap.ref);
      }
      // Delete batchPredictions and their subcollections (chunks)
      const batchPredictionsSnapshot = await getDocs(batchPredictionsRef);
      for (const batchDoc of batchPredictionsSnapshot.docs) {
        // Delete chunks subcollection if exists
        const chunksRef = collection(batchDoc.ref, "chunks");
        const chunksSnapshot = await getDocs(chunksRef);
        for (const chunkDoc of chunksSnapshot.docs) {
          await deleteDoc(chunkDoc.ref);
        }
        await deleteDoc(batchDoc.ref);
      }
      // Delete user document
      await deleteDoc(userRef);
      // Delete the user authentication account
      await deleteUser(user);
      toast.success("Account deleted successfully");
      navigate("/"); // Navigate to home page
    } catch (error) {
      console.error("Error deleting account:", error);
      if (error.code === "auth/requires-recent-login") {
        setReAuthError("Please re-enter your password to confirm deletion");
        toast.error("Please re-enter your password to confirm deletion");
      } else if (error.code === "auth/wrong-password") {
        setReAuthError("Incorrect password. Please try again.");
        toast.error("Incorrect password. Please try again.");
      } else {
        const errorMessage =
          error.message || "Failed to delete account. Please try again.";
        toast.error(errorMessage);
        setReAuthError(errorMessage);
      }
    } finally {
      setIsProcessing(false);
      if (!reAuthError) {
        setShowDeleteConfirm(false);
      }
    }
  };

  // Add cleanup for password state when modal closes
  useEffect(() => {
    if (!showDeleteConfirm) {
      setPassword("");
      setReAuthError("");
    }
  }, [showDeleteConfirm]);

  // Add the hasPremiumAccess function before the return statement
  const hasPremiumAccess = () => {
    return (
      userDetails?.subscriptionPlan === "gold" ||
      userDetails?.subscriptionPlan === "trial"
    );
  };

  // Add the clearDateFilter function before the return statement
  const clearDateFilter = () => {
    setDateRange({
      startDate: "",
      endDate: "",
    });
  };

  // Add this after other useEffect hooks
  useEffect(() => {
    const loadUserPreferences = async () => {
      try {
        const currentUser = auth.currentUser;
        if (currentUser) {
          const userRef = doc(db, "Users", currentUser.uid);
          const userDoc = await getDoc(userRef);
          if (userDoc.exists()) {
            const userData = userDoc.data();
            setAutoSaveEnabled(userData.autoSaveEnabled || false);
          }
        }
      } catch (error) {
        console.error("Error loading user preferences:", error);
      }
    };
    loadUserPreferences();
  }, []);

  // Using the handleAutoSaveToggle function defined earlier at line 251

  // Add this function after other function declarations
  const fetchBatchPredictions = async () => {
    setLoadingBatch(true);
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        return null;
      }

      const batchPredictionsRef = collection(
        db,
        "Users",
        currentUser.uid,
        "batchPredictions"
      );
      const q = query(batchPredictionsRef, orderBy("timestamp", "desc"));
      const querySnapshot = await getDocs(q);

      const batchData = [];
      for (const docSnapshot of querySnapshot.docs) {
        const data = docSnapshot.data();

        // Get the summary from the main document
        let summary = data.summary || {};
        let totalRecords = data.totalRecords || data.recordCount || 0;

        // If there's no summary in the main document, calculate it from chunks
        if (!summary.highRisk && !summary.mediumRisk && !summary.lowRisk) {
          const chunksRef = collection(docSnapshot.ref, "chunks");
          const chunksSnapshot = await getDocs(chunksRef);

          let predictions = [];
          chunksSnapshot.forEach((chunkDoc) => {
            const chunkData = chunkDoc.data();
            if (chunkData.predictions && Array.isArray(chunkData.predictions)) {
              predictions = predictions.concat(chunkData.predictions);
              // Update total records if not set in main document
              if (!totalRecords) {
                totalRecords += chunkData.predictions.length;
              }
            }
          });

          // Calculate summary from predictions
          summary = predictions.reduce(
            (acc, pred) => {
              const probability = parseFloat(pred.churnProbability);
              if (probability > 0.7) acc.highRisk++;
              else if (probability > 0.3) acc.mediumRisk++;
              else acc.lowRisk++;
              return acc;
            },
            { highRisk: 0, mediumRisk: 0, lowRisk: 0 }
          );
        }

        batchData.push({
          id: docSnapshot.id,
          ...data,
          totalRecords,
          summary: {
            highRisk: summary.highRisk || summary.high || 0,
            mediumRisk: summary.mediumRisk || summary.medium || 0,
            lowRisk: summary.lowRisk || summary.low || 0,
          },
          date: data.timestamp
            ? formatDisplayDate(data.timestamp.toDate())
            : formatDisplayDate(data.saveTimestamp),
        });
      }

      setBatchPredictions(batchData);
    } catch (error) {
      console.error("Error fetching batch predictions:", error);
      toast.error("Failed to load batch predictions");
    } finally {
      setLoadingBatch(false);
    }
  };

  // Add this useEffect to fetch batch predictions when toggled
  useEffect(() => {
    if (showBatchHistory && showPredictions) {
      fetchBatchPredictions();
    }
  }, [showBatchHistory, showPredictions]);

  // Add this function to render batch predictions
  const renderBatchPredictions = () => (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-6 py-4 text-left text-sm font-bold text-[#1d5a7b] uppercase tracking-wider">
              Date
            </th>
            <th className="px-6 py-4 text-left text-sm font-bold text-[#1d5a7b] uppercase tracking-wider">
              File Name
            </th>
            <th className="px-6 py-4 text-left text-sm font-bold text-[#1d5a7b] uppercase tracking-wider">
              Total Records
            </th>
            <th className="px-6 py-4 text-left text-sm font-bold text-[#1d5a7b] uppercase tracking-wider">
              Churn Risk
            </th>
            <th className="px-6 py-4 text-left text-sm font-bold text-[#1d5a7b] uppercase tracking-wider">
              Details
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {batchPredictions.map((batch) => (
            <tr
              key={batch.id}
              className="hover:bg-gray-50 transition-colors duration-200"
            >
              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                {batch.date}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                {batch.fileName}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                {batch.totalRecords}
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <div className="flex flex-col gap-1">
                  <span className="text-sm text-red-600">
                    High: {batch.summary?.highRisk || 0}
                  </span>
                  <span className="text-sm text-yellow-600">
                    Medium: {batch.summary?.mediumRisk || 0}
                  </span>
                  <span className="text-sm text-green-600">
                    Low: {batch.summary?.lowRisk || 0}
                  </span>
                </div>
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                <button
                  onClick={() =>
                    navigate(`/batch-prediction-detail/${batch.id}`)
                  }
                  className="inline-flex items-center px-3 py-1 border border-[#1d5a7b] text-sm font-medium rounded-md text-[#1d5a7b] hover:bg-[#1d5a7b] hover:text-white transition-colors duration-200"
                >
                  <svg
                    className="w-4 h-4 mr-1.5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                    />
                  </svg>
                  View Details
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  // Add effect to handle prediction history visibility
  useEffect(() => {
    const handleHistoryNavigation = async () => {
      if (location.state?.showPredictions) {
        setShowPredictions(true);

        // First set the states
        await fetchPredictionHistory();
        if (location.state?.scrollToBatchPredictions) {
          setShowBatchHistory(true);
          await fetchBatchPredictions();
        }

        // Then handle scrolling with a delay to ensure content is rendered
        setTimeout(() => {
          const element = document.getElementById("prediction-history-section");
          if (element) {
            if (location.state?.fromBatchDetail) {
              // Use a longer delay when coming from batch detail page
              setTimeout(() => {
                element.scrollIntoView({
                  behavior: "smooth",
                  block: "start",
                });
              }, 100);
            } else {
              element.scrollIntoView({
                behavior: "smooth",
                block: "start",
              });
            }
          }
        }, 0);

        // Clear the state after using it
        window.history.replaceState({}, document.title);
      }
    };

    handleHistoryNavigation();
  }, [location.state]);

  const predictionHistoryRef = useRef(null);

  // 3. Refactor right panel card rendering into a function
  const renderSubscriptionCard = () => {
    if (userDetails?.subscriptionPlan === "free") {
      return (
        <div className="bg-white/90 rounded-xl p-8 shadow-lg border border-gray-200 flex flex-col justify-between h-full min-h-[420px] relative">
          <h2 className="text-2xl font-bold text-center mb-4">
            Upgrade to Gold Plan
          </h2>
          <div className="bg-yellow-50 rounded-lg p-3 mb-6">
            <p className="text-center font-medium text-yellow-800">
              Special Offer!
              <br />
              Try Premium Features Free for 1 Week
            </p>
          </div>
          <div className="text-center mb-8">
            <div className="flex items-center justify-center gap-1">
              <span className="text-2xl font-bold">₹</span>
              <span className="text-4xl font-bold">999</span>
              <span className="text-gray-600 mt-2">/month</span>
            </div>
          </div>
          <div className="space-y-4 mb-8">
            <div className="flex items-start gap-3">
              <div className="bg-yellow-100 p-2 rounded-full mt-0.5">
                {/* icon */}
                <svg
                  className="w-5 h-5 text-yellow-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                  />
                </svg>
              </div>
              <div>
                <h4 className="font-semibold text-gray-800">
                  Unlimited Predictions
                </h4>
                <p className="text-sm text-gray-600">
                  No restrictions on predictions
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="bg-yellow-100 p-2 rounded-full mt-0.5">
                <svg
                  className="w-5 h-5 text-yellow-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M4 7v10c0 2 1 3 3 3h10c2 0 3-1 3-3V7c0-2-1-3-3-3H7C5 4 4 5 4 7z M16 2v4M8 2v4M4 9h16"
                  />
                </svg>
              </div>
              <div>
                <h4 className="font-semibold text-gray-800">
                  Batch Processing
                </h4>
                <p className="text-sm text-gray-600">
                  Process multiple files at once
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="bg-yellow-100 p-2 rounded-full mt-0.5">
                <svg
                  className="w-5 h-5 text-yellow-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </div>
              <div>
                <h4 className="font-semibold text-gray-800">
                  Priority Support
                </h4>
                <p className="text-sm text-gray-600">
                  24/7 premium customer support
                </p>
              </div>
            </div>
          </div>
          {!userDetails?.trialUsed ? (
            <button
              onClick={startTrial}
              className="w-full bg-[#F7B614] hover:bg-[#e5a912] text-white rounded-full py-3 px-8 font-semibold transition-all duration-300 shadow-lg hover:shadow-xl flex items-center justify-center gap-2 mb-4"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M13 10V3L4 14h7v7l9-11h-7z"
                />
              </svg>
              Start 1-Week Free Trial
            </button>
          ) : (
            <button
              onClick={handlePremiumUpgrade}
              className="w-full bg-[#F7B614] hover:bg-[#e5a912] text-white rounded-full py-3 px-8 font-semibold transition-all duration-300 shadow-lg hover:shadow-xl flex items-center justify-center gap-2 mb-4"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
                />
              </svg>
              Upgrade to Premium
            </button>
          )}
          <p className="text-center text-sm text-gray-500">
            No credit card required.
          </p>
        </div>
      );
    }
    if (userDetails?.subscriptionPlan === "trial") {
      const daysLeft = (() => {
        const end = getDateObj(userDetails.trialEndDate);
        if (!end) return 0;
        const diff = Math.ceil((end - new Date()) / (1000 * 60 * 60 * 24));
        return diff > 0 ? diff : 0;
      })();
      return (
        <div className="bg-white/90 rounded-xl p-8 shadow-lg border border-gray-200 flex flex-col justify-between h-full min-h-[420px] relative items-center text-center">
          {/* Yellow badge */}
          <div className="absolute top-6 left-1/2 -translate-x-1/2">
            <span className="inline-flex items-center px-4 py-1 bg-yellow-100 text-yellow-800 font-semibold rounded-full shadow text-base">
              <svg
                className="w-5 h-5 mr-2 text-yellow-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M5 2a2 2 0 00-2 2v14l3.5-2 3.5 2 3.5-2 3.5-2V4a2 2 0 00-2-2H5z"
                />
              </svg>
              Trial Active
            </span>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mt-12 mb-4">
            Trial Period
          </h2>
          {/* Days left */}
          <div className="mb-2">
            <span className="text-4xl font-extrabold text-gray-900">
              {daysLeft} days remaining
            </span>
          </div>
          {/* Dates row */}
          <div className="flex justify-center gap-8 mb-6">
            <div>
              <div className="text-gray-500 text-xs">Started</div>
              <div className="text-base font-semibold text-gray-800">
                {formatDisplayDate(userDetails.trialStartDate)}
              </div>
            </div>
            <div>
              <div className="text-gray-500 text-xs">Ends</div>
              <div className="text-base font-semibold text-gray-800">
                {formatDisplayDate(userDetails.trialEndDate)}
              </div>
            </div>
          </div>
          <button
            onClick={handlePremiumUpgrade}
            className="w-full bg-yellow-400 hover:bg-yellow-500 text-white rounded-full py-3 px-8 font-semibold transition-all duration-300 shadow-lg hover:shadow-xl flex items-center justify-center gap-2 mt-2"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
              />
            </svg>
            Upgrade to Premium
          </button>
          <p className="text-center text-sm text-gray-500">
            Enjoy all premium features during your trial.
          </p>
        </div>
      );
    }
    if (userDetails?.subscriptionPlan === "gold") {
      return (
        <div className="premium-spiral-border rounded-3xl relative flex flex-col items-center justify-center min-h-[420px] mt-15">
          {/* Sparkles */}
          <svg
            className="premium-sparkle"
            style={{ top: "18px", left: "24px", width: "18px", height: "18px" }}
            viewBox="0 0 20 20"
            fill="gold"
          >
            <circle cx="10" cy="10" r="2" opacity="0.7" />
            <circle cx="16" cy="4" r="1" opacity="0.5" />
            <circle cx="4" cy="16" r="1.2" opacity="0.5" />
          </svg>
          <svg
            className="premium-sparkle"
            style={{
              bottom: "18px",
              right: "24px",
              width: "14px",
              height: "14px",
            }}
            viewBox="0 0 20 20"
            fill="#ffe082"
          >
            <circle cx="10" cy="10" r="1.5" opacity="0.7" />
          </svg>
          {/* Crown */}
          <div className="premium-crown">
            <svg
              className="w-10 h-10 text-yellow-400"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M5 19h14v2H5z" />
              <path d="M2 7l5 5 5-9 5 9 5-5-3 12H5z" />
            </svg>
          </div>
          <div className="premium-inner-card w-full">
            {/* Premium badge */}
            <div className="flex items-center gap-2 mb-4 ">
              <span className="inline-flex items-center px-4 py-1 bg-yellow-100 text-yellow-800 font-semibold rounded-full shadow text-base">
                <svg
                  className="w-5 h-5 mr-2 text-yellow-500"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M5 2a2 2 0 00-2 2v14l3.5-2 3.5 2 3.5-2 3.5-2V4a2 2 0 00-2-2H5zm4.707 3.707a1 1 0 00-1.414-1.414l-3 3a1 1 0 000 1.414l3 3a1 1 0 001.414-1.414L8.414 9H10a3 3 0 013 3v1a1 1 0 102 0v-1a5 5 0 00-5-5H8.414l1.293-1.293z"
                    clipRule="evenodd"
                  />
                </svg>
                PREMIUM ACTIVE
              </span>
            </div>
            {/* Gradient heading */}
            <h2 className="text-2xl font-extrabold mb-4 bg-gradient-to-r from-yellow-600 via-yellow-500 to-amber-500 bg-clip-text text-transparent drop-shadow-lg">
              Premium Features Active
            </h2>
            {/* White glassy info box */}
            <div className="w-full bg-white rounded-xl shadow p-6 mb-6 flex flex-col items-center">
              <div className="flex flex-col gap-2 w-full">
                <div className="flex justify-between w-full">
                  <span className="text-gray-600 font-medium">Started:</span>
                  <span className="text-lg font-bold text-yellow-700">
                    {formatDisplayDate(userDetails.subscriptionStartDate)}
                  </span>
                </div>
                <div className="flex justify-between w-full">
                  <span className="text-gray-600 font-medium">
                    Next Billing:
                  </span>
                  <span className="text-lg font-bold text-yellow-700">
                    {formatDisplayDate(userDetails.subscriptionEndDate)}
                  </span>
                </div>
                <hr className="my-3 border-yellow-100" />
                <div className="flex items-center gap-2 justify-center w-full">
                  <svg
                    className="w-5 h-5 text-green-500"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <span className="text-lg font-bold text-green-600">
                    Active Subscription
                  </span>
                </div>
              </div>
            </div>
            <p className="text-center text-sm text-yellow-900">
              Monthly billing • Premium support included
            </p>
          </div>
        </div>
      );
    }
    // Fallback for unknown plan
    return (
      <div className="bg-red-100 text-red-700 p-6 rounded-xl text-center mt-8">
        <h3 className="text-2xl font-bold mb-2">Unknown Plan</h3>
        <p className="mb-2">
          Your subscription plan is not recognized:{" "}
          <b>{String(userDetails?.subscriptionPlan)}</b>
        </p>
        <p>Please contact support or try logging out and back in.</p>
      </div>
    );
  };

  // Fetch today's prediction count for free users
  useEffect(() => {
    const fetchTodayPredictionCount = async () => {
      const currentUser = auth.currentUser;
      if (!currentUser || userDetails?.subscriptionPlan !== "free") return;
      const predictionsRef = collection(
        db,
        "Users",
        currentUser.uid,
        "predictions"
      );
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const q = query(predictionsRef, orderBy("timestamp", "desc"));
      const querySnapshot = await getDocs(q);
      let count = 0;
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        if (data.timestamp && data.timestamp.toDate) {
          const predDate = data.timestamp.toDate();
          // Only count predictions made after today's midnight
          if (
            predDate >= today &&
            predDate < new Date(today.getTime() + 24 * 60 * 60 * 1000)
          )
            count++;
        }
      });
      setTodayPredictionCount(count);
    };
    if (userDetails?.subscriptionPlan === "free") {
      fetchTodayPredictionCount();
    }
  }, [userDetails?.subscriptionPlan, predictions]);

  // Add this useEffect to handle plan expiration and advance notifications
  useEffect(() => {
    if (!userDetails) return;
    const now = new Date();
    let updated = false;

    // If no plan, set to free
    if (!userDetails.subscriptionPlan) {
      setUserDetails((prev) => ({ ...prev, subscriptionPlan: "free" }));
      updated = true;
    }

    // Trial plan expiration and advance notification
    if (userDetails.subscriptionPlan === "trial" && userDetails.trialEndDate) {
      const trialEnd = getDateObj(userDetails.trialEndDate);
      const daysLeft = Math.ceil((trialEnd - now) / (1000 * 60 * 60 * 24));
      if (daysLeft > 0 && daysLeft <= 2) {
        toast.info(
          `Your trial ends on ${trialEnd.toLocaleDateString("en-IN")}. Upgrade to Gold to keep premium features!`,
          { autoClose: 6000 }
        );
      }
      if (trialEnd < now) {
        // Revert to free plan
        const revertToFree = async () => {
          const userRef = doc(db, "Users", auth.currentUser.uid);
          await updateDoc(userRef, {
            subscriptionPlan: "free",
            trialEndDate: null,
            trialStartDate: null,
            lastUpdated: new Date(),
          });
          setUserDetails((prev) => ({
            ...prev,
            subscriptionPlan: "free",
            trialEndDate: null,
            trialStartDate: null,
          }));
          toast.info(
            "Your trial period has ended. Upgrade to Gold for uninterrupted premium features!"
          );
        };
        revertToFree();
        updated = true;
      }
    }

    // Gold plan expiration and advance notification
    if (
      userDetails.subscriptionPlan === "gold" &&
      userDetails.subscriptionEndDate
    ) {
      const goldEnd = getDateObj(userDetails.subscriptionEndDate);
      const daysLeft = Math.ceil((goldEnd - now) / (1000 * 60 * 60 * 24));
      if (daysLeft > 0 && daysLeft <= 2) {
        toast.info(
          `Your Gold plan ends on ${goldEnd.toLocaleDateString("en-IN")}. Please renew to avoid interruption.`,
          { autoClose: 6000 }
        );
      }
      if (goldEnd < now) {
        // Revert to free plan
        const revertToFree = async () => {
          const userRef = doc(db, "Users", auth.currentUser.uid);
          await updateDoc(userRef, {
            subscriptionPlan: "free",
            subscriptionEndDate: null,
            subscriptionStartDate: null,
            lastUpdated: new Date(),
          });
          setUserDetails((prev) => ({
            ...prev,
            subscriptionPlan: "free",
            subscriptionEndDate: null,
            subscriptionStartDate: null,
          }));
          toast.info(
            "Your Gold subscription has ended. Please renew to regain premium features."
          );
        };
        revertToFree();
        updated = true;
      }
    }

    // If plan is not recognized, revert to free
    if (
      userDetails.subscriptionPlan &&
      !["free", "trial", "gold"].includes(userDetails.subscriptionPlan)
    ) {
      setUserDetails((prev) => ({ ...prev, subscriptionPlan: "free" }));
      updated = true;
    }

    // Optionally, you can force a reload if updated
  }, [userDetails]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100">
      <div className="w-full pt-[140px] md:pt-[160px] pb-12 px-4">
        {isActivating ? (
          <div className="flex flex-col items-center justify-center min-h-[60vh]">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#1d5a7b] mb-4"></div>
            <p className="text-gray-600">Setting up your plan...</p>
          </div>
        ) : userDetails ? (
          <>
            <div className="max-w-7xl mx-auto">
              <div className="bg-white/80 backdrop-blur-lg rounded-[2rem] shadow-xl border border-white/20 overflow-hidden">
                <div className="flex flex-col lg:flex-row">
                  {/* Left Panel - User Info */}
                  <div className="lg:w-2/3 p-8 lg:p-12">
                    <div className="flex justify-between items-start mb-8">
                      <div>
                        <h3 className="text-sm font-medium text-[#1d5a7b]/70 uppercase tracking-wider mb-1">
                          Account Details
                        </h3>
                        <div className="h-1 w-12 bg-[#1d5a7b] rounded"></div>
                      </div>
                      {!isLoading && hasPremiumAccess() && (
                        <div className="gold-member-badge transform hover:scale-105 transition-all">
                          <div className="flex items-center gap-2 px-4 py-2 bg-yellow-100 rounded-full">
                            <svg
                              className="w-5 h-5 text-yellow-600"
                              fill="currentColor"
                              viewBox="0 0 20 20"
                            >
                              <path
                                fillRule="evenodd"
                                d="M5 2a2 2 0 00-2 2v14l3.5-2 3.5 2 3.5-2 3.5-2V4a2 2 0 00-2-2H5zm4.707 3.707a1 1 0 00-1.414-1.414l-3 3a1 1 0 000 1.414l3 3a1 1 0 001.414-1.414L8.414 9H10a3 3 0 013 3v1a1 1 0 102 0v-1a5 5 0 00-5-5H8.414l1.293-1.293z"
                                clipRule="evenodd"
                              />
                            </svg>
                            <span className="text-yellow-800 font-semibold">
                              PREMIUM MEMBER
                            </span>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="mb-12">
                      <h1 className="text-5xl font-bold mb-2 bg-gradient-to-r from-[#1d5a7b] to-[#2d7ba4] bg-clip-text text-transparent">
                        {isLoading ? (
                          <div className="animate-pulse bg-gray-200 h-12 w-48 rounded"></div>
                        ) : (
                          userDetails?.firstName || "User"
                        )}
                      </h1>
                      <h2 className="text-4xl font-bold text-gray-600 mb-4">
                        {isLoading ? (
                          <div className="animate-pulse bg-gray-200 h-10 w-40 rounded"></div>
                        ) : (
                          userDetails?.lastName || ""
                        )}
                      </h2>
                      <p className="text-gray-600 text-lg leading-relaxed">
                        Customer at Churn Prediction Service.
                        <br />
                        Currently using our AI prediction tools.
                      </p>
                    </div>

                    <div className="space-y-6 mb-12">
                      <div className="flex items-center gap-6">
                        <span className="text-gray-500 w-32">First name:</span>
                        {isEditing ? (
                          <input
                            type="text"
                            value={editedInfo.firstName}
                            onChange={(e) =>
                              setEditedInfo((prev) => ({
                                ...prev,
                                firstName: e.target.value,
                              }))
                            }
                            className="font-medium text-gray-800 px-3 py-1 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-[#1d5a7b] focus:border-[#1d5a7b]"
                          />
                        ) : (
                          <span className="font-medium text-gray-800">
                            {isLoading ? (
                              <div className="animate-pulse bg-gray-200 h-5 w-24 rounded"></div>
                            ) : (
                              userDetails?.firstName || "N/A"
                            )}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-6">
                        <span className="text-gray-500 w-32">Last name:</span>
                        {isEditing ? (
                          <input
                            type="text"
                            value={editedInfo.lastName}
                            onChange={(e) =>
                              setEditedInfo((prev) => ({
                                ...prev,
                                lastName: e.target.value,
                              }))
                            }
                            className="font-medium text-gray-800 px-3 py-1 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-[#1d5a7b] focus:border-[#1d5a7b]"
                          />
                        ) : (
                          <span className="font-medium text-gray-800">
                            {isLoading ? (
                              <div className="animate-pulse bg-gray-200 h-5 w-24 rounded"></div>
                            ) : (
                              userDetails?.lastName || "N/A"
                            )}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-6">
                        <span className="text-gray-500 w-32">Email:</span>
                        <span className="font-medium text-gray-800">
                          {isLoading ? (
                            <div className="animate-pulse bg-gray-200 h-5 w-32 rounded"></div>
                          ) : (
                            userDetails?.email || "N/A"
                          )}
                        </span>
                      </div>
                    </div>

                    {/* Add the ModernUsageMeter component here */}
                    <ModernUsageMeter
                      userDetails={userDetails}
                      todayPredictionCount={todayPredictionCount}
                      maxPredictions={PREDICTION_LIMIT_FREE}
                    />

                    <div className="flex flex-wrap gap-4">
                      <button
                        onClick={handleLogout}
                        className="bg-red-500 hover:bg-red-600 text-white rounded-full py-3 px-8 font-medium transition-all duration-300 shadow-lg hover:shadow-xl flex items-center gap-2 transform hover:scale-105"
                      >
                        <svg
                          className="w-5 h-5"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                          />
                        </svg>
                        Logout
                      </button>

                      {isEditing ? (
                        <button
                          onClick={handleSaveClick}
                          className="bg-green-500 hover:bg-green-600 text-white rounded-full py-3 px-8 font-medium transition-all duration-300 shadow-lg hover:shadow-xl flex items-center gap-2 transform hover:scale-105"
                        >
                          <svg
                            className="w-5 h-5"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth="2"
                              d="M5 13l4 4L19 7"
                            />
                          </svg>
                          Save Changes
                        </button>
                      ) : (
                        <button
                          onClick={handleEditClick}
                          className="bg-blue-500 hover:bg-blue-600 text-white rounded-full py-3 px-8 font-medium transition-all duration-300 shadow-lg hover:shadow-xl flex items-center gap-2 transform hover:scale-105"
                        >
                          <svg
                            className="w-5 h-5"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth="2"
                              d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                            />
                          </svg>
                          Edit Profile
                        </button>
                      )}

                      <button
                        onClick={togglePredictionHistory}
                        className="bg-[#1d5a7b] hover:bg-[#164e68] text-white rounded-full py-3 px-8 font-medium transition-all duration-300 shadow-lg hover:shadow-xl flex items-center gap-2 transform hover:scale-105"
                      >
                        <svg
                          className="w-5 h-5"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                          />
                        </svg>
                        {showPredictions
                          ? "Hide Predictions"
                          : "View Saved Predictions"}
                      </button>

                      <div className="flex items-center gap-4">
                        {hasPremiumAccess() && (
                          <>
                            <Tooltip content="Choose this to auto-save every prediction result">
                              <button
                                onClick={handleAutoSaveToggle}
                                className={`${
                                  autoSaveEnabled
                                    ? "bg-green-600 hover:bg-green-700"
                                    : "bg-red-600 hover:bg-red-700"
                                } text-white rounded-full py-3 px-8 font-medium transition-all duration-300 shadow-lg hover:shadow-xl flex items-center gap-2 transform hover:scale-105`}
                              >
                                <svg
                                  className="w-5 h-5"
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth="2"
                                    d="M5 13l4 4L19 7"
                                  />
                                </svg>
                                Auto-save {autoSaveEnabled ? "ON" : "OFF"}
                              </button>
                            </Tooltip>

                            <button
                              onClick={() => navigate("/prediction")}
                              className="bg-[#1d5a7b] hover:bg-[#164e68] text-white rounded-full py-3 px-8 font-medium transition-all duration-300 shadow-lg hover:shadow-xl flex items-center gap-2 transform hover:scale-105"
                            >
                              <svg
                                className="w-5 h-5"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth="2"
                                  d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                                />
                              </svg>
                              Make Prediction
                            </button>
                          </>
                        )}

                        <button
                          onClick={() => setShowDeleteConfirm(true)}
                          className="bg-red-600 hover:bg-red-700 text-white rounded-full py-3 px-8 font-medium transition-all duration-300 shadow-lg hover:shadow-xl flex items-center gap-2 transform hover:scale-105"
                        >
                          <svg
                            className="w-5 h-5"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth="2"
                              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                            />
                          </svg>
                          Delete Account
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Right Panel - Plan Info */}
                  <div className="lg:w-1/3 p-8 lg:p-12 bg-gradient-to-br from-gray-50/50 via-white/50 to-gray-100/50 backdrop-blur-md border-l border-white/20 flex flex-col justify-between">
                    {renderSubscriptionCard()}
                  </div>
                </div>
              </div>

              {/* Prediction History Section */}
              {showPredictions && (
                <div
                  id="prediction-history-section"
                  ref={predictionHistoryRef}
                  className="mt-8 bg-white/80 backdrop-blur-lg rounded-[2rem] shadow-xl border border-white/20 overflow-hidden p-8"
                >
                  <div className="flex items-center justify-between mb-6">
                    <div>
                      <h3 className="text-xl font-bold text-gray-800">
                        Saved Predictions
                      </h3>
                      <div className="h-1 w-20 bg-[#1d5a7b] rounded"></div>
                    </div>
                    <div className="flex gap-4">
                      <button
                        onClick={() => setShowBatchHistory(false)}
                        className={`px-4 py-2 rounded-lg transition-all duration-200 ${
                          !showBatchHistory
                            ? "bg-[#1d5a7b] text-white shadow-lg"
                            : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                        }`}
                      >
                        Single Predictions
                      </button>
                      <button
                        onClick={() => {
                          if (hasPremiumAccess()) {
                            setShowBatchHistory(true);
                          } else {
                            toast.error(
                              "Batch predictions are only available for Premium subscribers"
                            );
                          }
                        }}
                        className={`px-4 py-2 rounded-lg transition-all duration-200 ${
                          showBatchHistory
                            ? "bg-[#1d5a7b] text-white shadow-lg"
                            : hasPremiumAccess()
                              ? "bg-gray-200 text-gray-700 hover:bg-gray-300"
                              : "bg-gray-100 text-gray-400 cursor-not-allowed"
                        }`}
                        disabled={!hasPremiumAccess()}
                      >
                        Batch Predictions
                      </button>
                    </div>
                  </div>

                  {/* Search and Filter Section - Only show for single predictions */}
                  {!showBatchHistory && (
                    <div className="mb-6 space-y-4 sm:space-y-0 sm:flex sm:gap-4">
                      <div className="flex-1">
                        <div className="relative w-64">
                          <input
                            type="text"
                            placeholder="Search by Customer ID..."
                            value={searchCustomerId}
                            onChange={(e) =>
                              setSearchCustomerId(e.target.value)
                            }
                            className="w-full pl-8 pr-3 py-1.5 rounded-md border border-gray-200 focus:outline-none focus:ring-1 focus:ring-[#1d5a7b] focus:border-[#1d5a7b] text-sm"
                          />
                          <span className="absolute left-2.5 top-1/2 transform -translate-y-1/2">
                            <svg
                              className="w-3.5 h-3.5 text-gray-400"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth="2"
                                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                              />
                            </svg>
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="relative w-36">
                          <input
                            type="date"
                            value={dateRange.startDate}
                            onChange={(e) =>
                              setDateRange((prev) => ({
                                ...prev,
                                startDate: e.target.value,
                              }))
                            }
                            className="w-full pl-3 pr-2 py-1.5 rounded-md border border-gray-200 focus:outline-none focus:ring-1 focus:ring-[#1d5a7b] focus:border-[#1d5a7b] text-sm"
                          />
                        </div>
                        <span className="text-gray-500 text-sm font-medium">
                          to
                        </span>
                        <div className="relative w-36">
                          <input
                            type="date"
                            value={dateRange.endDate}
                            onChange={(e) =>
                              setDateRange((prev) => ({
                                ...prev,
                                endDate: e.target.value,
                              }))
                            }
                            className="w-full pl-3 pr-2 py-1.5 rounded-md border border-gray-200 focus:outline-none focus:ring-1 focus:ring-[#1d5a7b] focus:border-[#1d5a7b] text-sm"
                          />
                        </div>
                        <button
                          onClick={clearDateFilter}
                          disabled={!dateRange.startDate && !dateRange.endDate}
                          className={`p-1.5 rounded-md border border-gray-200 hover:bg-gray-50 focus:outline-none focus:ring-1 focus:ring-[#1d5a7b] focus:border-[#1d5a7b] transition-colors duration-200 ${
                            dateRange.startDate || dateRange.endDate
                              ? "bg-gray-100 text-gray-700"
                              : "bg-gray-50 text-gray-400 cursor-not-allowed"
                          }`}
                        >
                          <svg
                            className="w-4 h-4"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth="2"
                              d="M6 18L18 6M6 6l12 12"
                            />
                          </svg>
                        </button>
                      </div>
                    </div>
                  )}

                  {loadingBatch || loading ? (
                    <div className="space-y-4">
                      <div className="animate-pulse space-y-4">
                        {[1, 2, 3].map((i) => (
                          <div
                            key={i}
                            className="bg-white rounded-lg p-4 flex items-center justify-between"
                          >
                            <div className="space-y-3 flex-1">
                              <div className="h-4 bg-gray-200 rounded w-1/4"></div>
                              <div className="h-4 bg-gray-200 rounded w-1/2"></div>
                            </div>
                            <div className="flex space-x-4">
                              <div className="h-8 w-24 bg-gray-200 rounded"></div>
                              <div className="h-8 w-24 bg-gray-200 rounded"></div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : showBatchHistory ? (
                    batchPredictions.length > 0 ? (
                      renderBatchPredictions()
                    ) : (
                      <div className="text-center py-6 bg-gray-50 rounded-xl">
                        <svg
                          className="w-12 h-12 text-gray-400 mx-auto mb-3"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                          />
                        </svg>
                        <p className="text-gray-500 text-sm">
                          No batch predictions found. Upload a CSV file to see
                          batch predictions here!
                        </p>
                      </div>
                    )
                  ) : predictions.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-6 py-4 text-left text-sm font-bold text-[#1d5a7b] uppercase tracking-wider">
                              Date
                            </th>
                            <th className="px-6 py-4 text-left text-sm font-bold text-[#1d5a7b] uppercase tracking-wider">
                              Customer ID
                            </th>
                            <th className="px-6 py-4 text-left text-sm font-bold text-[#1d5a7b] uppercase tracking-wider">
                              Prediction
                            </th>
                            <th className="px-6 py-4 text-left text-sm font-bold text-[#1d5a7b] uppercase tracking-wider">
                              Churn Probability
                            </th>
                            <th className="px-6 py-4 text-left text-sm font-bold text-[#1d5a7b] uppercase tracking-wider">
                              Details
                            </th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {filteredPredictions.map((pred) => (
                            <tr
                              key={pred.id}
                              className="hover:bg-gray-50 transition-colors duration-200"
                            >
                              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                {pred.date}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                {pred.formData?.CustomerID ||
                                  `Customer ${pred.id}`}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <span
                                  className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                                    pred.prediction === 1
                                      ? "bg-red-100 text-red-800"
                                      : "bg-green-100 text-green-800"
                                  }`}
                                >
                                  {pred.prediction === 1
                                    ? "Likely to Churn"
                                    : "Likely to Stay"}
                                </span>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <span className="text-sm font-semibold text-gray-900">
                                  {(pred.churn_probability * 100).toFixed(1)}%
                                  churn |{" "}
                                  {(pred.stay_probability * 100).toFixed(1)}%
                                  stay
                                </span>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <button
                                  onClick={() =>
                                    navigate(`/prediction-detail/${pred.id}`)
                                  }
                                  className="inline-flex items-center px-3 py-1 border border-[#1d5a7b] text-sm font-medium rounded-md text-[#1d5a7b] hover:bg-[#1d5a7b] hover:text-white transition-colors duration-200"
                                >
                                  <svg
                                    className="w-4 h-4 mr-1.5"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth="2"
                                      d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                                    />
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth="2"
                                      d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                                    />
                                  </svg>
                                  View Details
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="text-center py-6 bg-gray-50 rounded-xl">
                      <svg
                        className="w-12 h-12 text-gray-400 mx-auto mb-3"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2"
                          d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                        />
                      </svg>
                      <p className="text-gray-500 text-sm">
                        No saved predictions found. Make some predictions to see
                        them here!
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex justify-center items-center min-h-[60vh]">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#1d5a7b]"></div>
          </div>
        )}
      </div>

      {showDeleteConfirm && (
        <div className="fixed inset-0 flex items-center justify-center z-50">
          {/* Backdrop with blur */}
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm"></div>

          {/* Modal */}
          <div className="relative bg-white/90 backdrop-blur-md rounded-2xl p-8 max-w-md w-full mx-4 shadow-xl border border-white/20 transform transition-all">
            <div className="relative z-10">
              <h3 className="text-2xl font-bold text-gray-800 mb-4">
                Delete Account
              </h3>
              <p className="text-gray-600 mb-6">
                Are you sure you want to delete your account? This action cannot
                be undone and will permanently delete all your data.
              </p>

              {/* Password confirmation input */}
              <div className="mb-6">
                <label
                  htmlFor="password"
                  className="block text-sm font-medium text-gray-700 mb-2"
                >
                  Enter your password to confirm deletion
                </label>
                <input
                  type="password"
                  id="password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setReAuthError(""); // Clear error when user types
                  }}
                  className={`w-full px-4 py-2 rounded-lg border ${
                    reAuthError
                      ? "border-red-500 focus:ring-red-500"
                      : "border-gray-300 focus:ring-red-500"
                  } focus:outline-none focus:ring-2 focus:border-transparent`}
                  placeholder="Enter your password"
                />
                {reAuthError && (
                  <p className="mt-2 text-sm text-red-600 flex items-center">
                    <svg
                      className="w-4 h-4 mr-1"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 002 0V6a1 1 0 00-1-1z"
                        clipRule="evenodd"
                      />
                    </svg>
                    {reAuthError}
                  </p>
                )}
              </div>

              <div className="flex gap-4">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-xl py-2.5 px-4 font-medium transition-all duration-200 backdrop-blur-sm border border-gray-200"
                  disabled={isProcessing}
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteAccount}
                  disabled={!password.trim() || isProcessing}
                  className={`flex-1 rounded-xl py-2.5 px-4 font-medium transition-all duration-200 backdrop-blur-sm border flex items-center justify-center
                    ${
                      !password.trim() || isProcessing
                        ? "bg-red-300/90 cursor-not-allowed border-red-200/20 text-white"
                        : "bg-red-500/90 hover:bg-red-600/90 border-red-400/20 text-white"
                    }`}
                >
                  {isProcessing ? (
                    <>
                      <svg
                        className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        ></circle>
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        ></path>
                      </svg>
                      Deleting...
                    </>
                  ) : (
                    "Delete Account"
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Account;
