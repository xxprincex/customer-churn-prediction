import { useEffect, useState } from "react";
import { auth, db } from "./firebase";
import { stripePromise, GOLD_PLAN_PRICE } from "../stripe";
import {
  getDoc,
  doc,
  collection,
  getDocs,
  query,
  orderBy,
  updateDoc,
} from "firebase/firestore";
import { signOut } from "firebase/auth";
import { useNavigate, useLocation } from "react-router-dom";
import { toast } from "react-toastify";

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

const Profile = () => {
  const [userDetails, setUserDetails] = useState(null);
  const [predictions, setPredictions] = useState([]);
  const [showPredictions, setShowPredictions] = useState(false);
  const [loading, setLoading] = useState(false);
  const [subscriptionPlan, setSubscriptionPlan] = useState("Free");
  const [searchCustomerId, setSearchCustomerId] = useState("");
  const [dateRange, setDateRange] = useState({
    startDate: "",
    endDate: "",
  });
  const [isProcessing, setIsProcessing] = useState(false);
  const [isActivating, setIsActivating] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const filteredPredictions = predictions.filter((pred) => {
    const matchesCustomerId = pred.formData?.CustomerID?.toLowerCase().includes(
      searchCustomerId.toLowerCase()
    );

    const predDate = new Date(pred.date);
    const startDate = dateRange.startDate
      ? new Date(dateRange.startDate)
      : null;
    const endDate = dateRange.endDate ? new Date(dateRange.endDate) : null;

    const withinDateRange =
      (!startDate || predDate >= startDate) &&
      (!endDate || predDate <= endDate);

    return matchesCustomerId && withinDateRange;
  });

  const fetchPredictionHistory = async () => {
    setLoading(true);
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        console.log("No authenticated user found");
        setLoading(false);
        return;
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
            ? new Date(data.timestamp.toDate()).toLocaleString()
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
        console.error("No user found when trying to activate Gold plan");
        return;
      }

      console.log("Activating Gold plan for user:", currentUser.uid);
      console.log("Session ID:", sessionId);

      const userRef = doc(db, "Users", currentUser.uid);

      // First, check if user document exists
      const userDoc = await getDoc(userRef);
      if (!userDoc.exists()) {
        throw new Error("User document not found");
      }

      // Update user document with subscription details
      await updateDoc(userRef, {
        subscriptionPlan: "Gold",
        subscriptionStatus: "active",
        subscriptionStartDate: new Date(),
        lastPaymentSessionId: sessionId,
        lastUpdated: new Date(),
        trialEndDate: null,
      });

      console.log("Gold plan activated successfully");

      // Update local state
      setSubscriptionPlan("Gold");
      toast.success(
        "🌟 Welcome to the Gold Plan! Your premium features are now active."
      );

      // Refresh user data
      await fetchUserData();

      // Remove activation parameters from URL
      window.history.replaceState({}, "", "/account");
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
      const params = new URLSearchParams(location.search);
      const sessionId = params.get("session_id");

      if (location.pathname === "/account/activate" && sessionId) {
        console.log("Found activation parameters:", { sessionId });
        await activateGoldPlan(sessionId);
      }
    };

    handleActivation();
  }, [location]);

  // Add helper function to calculate trial end date (1 week)
  const calculateTrialEndDate = (startDate) => {
    const date = new Date(startDate);
    date.setDate(date.getDate() + 7); // 7 days trial
    return date;
  };

  // Update handleUpgrade function for trial start
  const handleUpgrade = async () => {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        toast.error("Please login to start your trial");
        navigate("/login");
        return;
      }

      // Start with 1-week trial
      const now = new Date();
      const trialEndDate = calculateTrialEndDate(now);

      const userRef = doc(db, "Users", currentUser.uid);
      await updateDoc(userRef, {
        subscriptionPlan: "Gold",
        subscriptionStatus: "trial",
        trialStartDate: now,
        trialEndDate: trialEndDate,
        lastUpdated: now,
      });

      setSubscriptionPlan("Gold");
      toast.success("🌟 Your 1-week free trial has started!");
      await fetchUserData();
    } catch (error) {
      console.error("Error starting trial:", error);
      toast.error("Could not start trial. Please try again.");
    }
  };

  // Add function to handle premium upgrade
  const handlePremiumUpgrade = async () => {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        toast.error("Please login to upgrade");
        navigate("/login");
        return;
      }

      // Redirect to Stripe payment
      const paymentUrl = `https://buy.stripe.com/test_14k14BbYP3iQfPa4gg`;
      window.location.href = paymentUrl;
      toast.info("Redirecting to secure payment...");
    } catch (error) {
      console.error("Error initiating upgrade:", error);
      toast.error("Could not process upgrade. Please try again.");
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

  // Update the checkPaymentStatus function
  const checkPaymentStatus = async () => {
    const pendingUpgrade = localStorage.getItem("pendingUpgrade");
    const upgradeStartTime = localStorage.getItem("upgradeStartTime");

    if (pendingUpgrade === "true" && upgradeStartTime) {
      localStorage.removeItem("pendingUpgrade");
      localStorage.removeItem("upgradeStartTime");

      try {
        const currentUser = auth.currentUser;
        if (!currentUser) return;

        const userRef = doc(db, "Users", currentUser.uid);

        // Calculate dates
        const startDate = new Date();
        const endDate = calculateExpiryDate(startDate);

        // Update Firestore with the dates
        await updateDoc(userRef, {
          subscriptionPlan: "Gold",
          subscriptionStatus: "active",
          subscriptionStartDate: startDate,
          subscriptionEndDate: endDate,
          lastUpdated: startDate,
        });

        console.log("Subscription dates:", {
          start: startDate.toISOString(),
          end: endDate.toISOString(),
        });

        setSubscriptionPlan("Gold");
        toast.success(
          `🌟 Welcome to the Gold Plan! Active until ${endDate.toLocaleDateString("en-IN")}`
        );
        await fetchUserData();
      } catch (error) {
        console.error("Error activating subscription:", error);
        toast.error(
          "There was an issue activating your subscription. Please contact support."
        );
      }
    }
  };

  // Check payment status on component mount and when returning to the page
  useEffect(() => {
    if (document.visibilityState === "visible") {
      checkPaymentStatus();
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        checkPaymentStatus();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  const checkTrialStatus = async (userData) => {
    if (userData.trialEndDate) {
      const trialEnd = userData.trialEndDate.toDate();
      if (trialEnd < new Date()) {
        // Trial has expired
        const userRef = doc(db, "Users", auth.currentUser.uid);
        await updateDoc(userRef, {
          subscriptionPlan: "Free",
          trialEndDate: null,
          trialStartDate: null,
        });
        setSubscriptionPlan("Free");
        toast.info("Your trial period has ended. Upgrade coming soon!");
      }
    }
  };

  const fetchUserData = async () => {
    try {
      const currentUser = auth.currentUser;
      if (currentUser) {
        const docRef = doc(db, "Users", currentUser.uid);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
          const userData = docSnap.data();
          console.log("User subscription status:", userData.subscriptionPlan);
          setUserDetails(userData);
          setSubscriptionPlan(userData.subscriptionPlan || "Free");
          await checkTrialStatus(userData);
        } else {
          console.log("No user document found");
          navigate("/login");
        }
      } else {
        console.log("No authenticated user");
        setUserDetails(null);
        navigate("/login");
      }
    } catch (error) {
      console.error("Error fetching user data:", error);
      navigate("/login");
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

  useEffect(() => {
    // Add shine styles to document
    const styleSheet = document.createElement("style");
    styleSheet.innerText = goldShineStyles;
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

  // Update the Free User Promotion render function
  const renderFreeUserPromotion = () => (
    <div className="free-card rounded-[2rem] p-8 space-y-8">
      <div className="text-center space-y-6">
        <div className="floating">
          <div className="inline-block bg-yellow-100 rounded-full p-4">
            <svg
              className="w-12 h-12 text-yellow-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 100-16 9 9 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
              />
            </svg>
          </div>
        </div>

        <div>
          <h3 className="text-2xl font-bold text-gray-800 mb-2">
            Upgrade to Gold Plan
          </h3>
          <div className="bg-gradient-to-r from-yellow-400/20 to-amber-400/20 rounded-xl p-3 mb-4">
            <p className="text-yellow-800 font-semibold">
              Special Launch Offer!
            </p>
            <p className="text-yellow-700 text-sm">
              Try Premium Features Free for 1 Week
            </p>
          </div>
        </div>

        <div className="price-tag">
          <span className="text-4xl font-bold bg-gradient-to-r from-yellow-600 to-amber-600 bg-clip-text text-transparent">
            ₹999
          </span>
          <span className="text-gray-600 text-sm ml-2">/month</span>
        </div>
      </div>

      <div className="space-y-4">
        <FeatureCard
          icon={
            <svg
              className="w-4 h-4 text-yellow-600"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" />
            </svg>
          }
          title="Unlimited Predictions"
          description="No restrictions on predictions"
        />
        <FeatureCard
          icon={
            <svg
              className="w-4 h-4 text-yellow-600"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path d="M5.5 13a3.5 3.5 0 01-.369-6.98 4 4 0 117.753-1.977A4.5 4.5 0 1113.5 13H11V9.413l1.293 1.293a1 1 0 001.414-1.414l-3-3a1 1 0 00-1.414 0l-3 3a1 1 0 001.414 1.414L9 9.414V13H5.5z" />
            </svg>
          }
          title="Batch Processing"
          description="Process multiple files at once"
        />
        <FeatureCard
          icon={
            <svg
              className="w-4 h-4 text-yellow-600"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-2 0c0 .993-.241 1.929-.668 2.754l-1.524-1.525a3.997 3.997 0 00.078-2.183l1.562-1.562C15.802 8.249 16 9.1 16 10zm-5.165 3.913l1.58 1.58A5.98 5.98 0 0110 16a5.976 5.976 0 01-2.516-.552l1.562-1.562a4.006 4.006 0 001.789.027zm-4.677-2.796a4.002 4.002 0 01-.041-2.08l-.08.08-1.53-1.533A5.98 5.98 0 004 10c0 .954.223 1.856.619 2.657l1.54-1.54zm1.088-6.45A5.974 5.974 0 0110 4c.954 0 1.856.223 2.657.619l-1.54 1.54a4.002 4.002 0 00-2.346.033L7.246 4.668zM12 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          }
          title="Priority Support"
          description="24/7 premium customer support"
        />
      </div>

      <div className="space-y-3">
        <button
          onClick={handleUpgrade}
          className="w-full bg-gradient-to-r from-yellow-400 to-yellow-600 hover:from-yellow-500 hover:to-yellow-700 text-white rounded-full py-3 px-6 font-semibold transition-all duration-300 shadow-lg hover:shadow-xl transform hover:scale-105 flex items-center justify-center gap-2"
        >
          <svg
            className="w-5 h-5 animate-pulse"
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
        <p className="text-center text-sm text-gray-500">
          No credit card required • Cancel anytime
        </p>
      </div>
    </div>
  );

  // Update the Trial Content render function
  const renderTrialContent = () => {
    const trialEnd = userDetails.trialEndDate?.toDate();
    const trialStart = userDetails.trialStartDate?.toDate();
    const now = new Date();
    const daysLeft = Math.ceil((trialEnd - now) / (1000 * 60 * 60 * 24));
    const isExpiringSoon = daysLeft <= 2;

    return (
      <div className="trial-card rounded-[2rem] p-8 text-white space-y-8">
        <div className="trial-card-shine" />

        <div className="text-center space-y-6">
          <div className="inline-flex items-center px-4 py-2 bg-white/20 rounded-full font-semibold backdrop-blur-sm">
            <svg
              className="w-5 h-5 mr-2"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M5 2a2 2 0 00-2 2v14l3.5-2 3.5 2 3.5-2 3.5 2V4a2 2 0 00-2-2H5zm4.707 3.707a1 1 0 00-1.414-1.414l-3 3a1 1 0 000 1.414l3 3a1 1 0 001.414-1.414L8.414 9H10a3 3 0 013 3v1a1 1 0 102 0v-1a5 5 0 00-5-5H8.414l1.293-1.293z"
                clipRule="evenodd"
              />
            </svg>
            TRIAL ACTIVE
          </div>

          <div className="space-y-2">
            <h3 className="text-3xl font-bold">Trial Period</h3>
            <p className="text-blue-100">Experience premium features</p>
          </div>

          <div className="flex justify-center">
            <CountdownRing days={daysLeft} />
          </div>

          <div className="bg-white/10 rounded-xl p-6 backdrop-blur-sm">
            <div className="space-y-4">
              <div>
                <p className="text-blue-100">Started:</p>
                <p className="text-xl font-semibold">
                  {trialStart?.toLocaleDateString("en-IN")}
                </p>
              </div>
              <div>
                <p className="text-blue-100">Ends:</p>
                <p className="text-xl font-semibold">
                  {trialEnd?.toLocaleDateString("en-IN")}
                </p>
              </div>
            </div>
          </div>

          {isExpiringSoon && (
            <div className="bg-red-500/20 border border-red-300/20 rounded-xl p-4 backdrop-blur-sm">
              <div className="flex items-center gap-3">
                <svg
                  className="w-6 h-6"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                    clipRule="evenodd"
                  />
                </svg>
                <p className="font-medium">
                  Your trial is ending soon! Upgrade now to keep your premium
                  features.
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="space-y-3">
          <button
            onClick={handlePremiumUpgrade}
            className="w-full bg-white text-blue-600 rounded-full py-3 px-6 font-semibold transition-all duration-300 shadow-lg hover:shadow-xl transform hover:scale-105 flex items-center justify-center gap-2"
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
            Monthly plan • Cancel anytime
          </p>
        </div>
      </div>
    );
  };

  // Update the Premium Content render function
  const renderPremiumContent = () => {
    const startDate = userDetails.subscriptionStartDate?.toDate();
    const endDate = userDetails.subscriptionEndDate?.toDate();

    return (
      <div className="premium-gold-card rounded-[2rem] p-8 space-y-8">
        <div className="premium-card-shine" />

        <div className="text-center space-y-6">
          <div className="inline-flex items-center px-4 py-2 bg-gradient-to-r from-yellow-400 to-yellow-600 rounded-full text-white font-semibold shadow-lg">
            <svg
              className="w-5 h-5 mr-2"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M5 2a2 2 0 00-2 2v14l3.5-2 3.5 2 3.5-2 3.5 2V4a2 2 0 00-2-2H5zm4.707 3.707a1 1 0 00-1.414-1.414l-3 3a1 1 0 000 1.414l3 3a1 1 0 001.414-1.414L8.414 9H10a3 3 0 013 3v1a1 1 0 102 0v-1a5 5 0 00-5-5H8.414l1.293-1.293z"
                clipRule="evenodd"
              />
            </svg>
            GOLD MEMBER
          </div>

          <div className="floating">
            <svg
              className="w-16 h-16 text-yellow-600 mx-auto"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M5 2a2 2 0 00-2 2v14l3.5-2 3.5 2 3.5-2 3.5 2V4a2 2 0 00-2-2H5zm4.707 3.707a1 1 0 00-1.414-1.414l-3 3a1 1 0 000 1.414l3 3a1 1 0 001.414-1.414L8.414 9H10a3 3 0 013 3v1a1 1 0 102 0v-1a5 5 0 00-5-5H8.414l1.293-1.293z"
                clipRule="evenodd"
              />
            </svg>
          </div>

          <h3 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-yellow-600 to-amber-600">
            Premium Features Active
          </h3>

          <div className="bg-white rounded-xl p-6 shadow-md space-y-4">
            <div>
              <p className="text-gray-600">Started:</p>
              <p className="text-xl font-semibold text-yellow-700">
                {startDate?.toLocaleDateString("en-IN")}
              </p>
            </div>
            <div>
              <p className="text-gray-600">Next Billing:</p>
              <p className="text-xl font-semibold text-yellow-700">
                {endDate?.toLocaleDateString("en-IN")}
              </p>
            </div>
            <div className="pt-4 border-t border-gray-100">
              <div className="flex items-center justify-center gap-2">
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
                <p className="text-2xl font-bold text-green-600">
                  Active Subscription
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <button
            onClick={() =>
              window.open(
                "https://billing.stripe.com/p/login/test_28o28Z1Ox3mL3GE288",
                "_blank"
              )
            }
            className="w-full bg-gradient-to-r from-gray-100 to-gray-200 hover:from-gray-200 hover:to-gray-300 text-gray-700 rounded-full py-3 px-6 font-semibold transition-all duration-300 shadow-md hover:shadow-lg transform hover:scale-105 flex items-center justify-center gap-2"
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
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
            Manage Subscription
          </button>
          <p className="text-center text-sm text-gray-500">
            Monthly billing • Premium support included
          </p>
        </div>
      </div>
    );
  };

  // Add helper function to check for gold features access
  const hasGoldAccess = () => {
    return (
      subscriptionPlan === "Gold" &&
      (userDetails?.subscriptionStatus === "trial" ||
        userDetails?.subscriptionStatus === "active")
    );
  };

  // Add this to the Profile component where the date range state is defined
  const clearDateFilter = () => {
    setDateRange({
      startDate: "",
      endDate: "",
    });
  };

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
                      {hasGoldAccess() && (
                        <div className="gold-member-badge transform hover:scale-105 transition-all">
                          <div className="flex items-center gap-2 px-4 py-2">
                            <svg
                              className="w-5 h-5"
                              fill="currentColor"
                              viewBox="0 0 20 20"
                            >
                              <path
                                fillRule="evenodd"
                                d="M5 2a2 2 0 00-2 2v14l3.5-2 3.5 2 3.5-2 3.5 2V4a2 2 0 00-2-2H5zm4.707 3.707a1 1 0 00-1.414-1.414l-3 3a1 1 0 000 1.414l3 3a1 1 0 001.414-1.414L8.414 9H10a3 3 0 013 3v1a1 1 0 102 0v-1a5 5 0 00-5-5H8.414l1.293-1.293z"
                                clipRule="evenodd"
                              />
                            </svg>
                            {userDetails.subscriptionStatus === "trial"
                              ? "TRIAL ACTIVE"
                              : "GOLD MEMBER"}
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="mb-12">
                      <h1 className="text-5xl font-bold mb-2 bg-gradient-to-r from-[#1d5a7b] to-[#2d7ba4] bg-clip-text text-transparent">
                        {userDetails.firstName}
                      </h1>
                      <h2 className="text-4xl font-bold text-gray-600 mb-4">
                        {userDetails.lastName}
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
                        <span className="font-medium text-gray-800">
                          {userDetails.firstName}
                        </span>
                      </div>
                      <div className="flex items-center gap-6">
                        <span className="text-gray-500 w-32">Last name:</span>
                        <span className="font-medium text-gray-800">
                          {userDetails.lastName}
                        </span>
                      </div>
                      <div className="flex items-center gap-6">
                        <span className="text-gray-500 w-32">Email:</span>
                        <span className="font-medium text-gray-800">
                          {userDetails.email}
                        </span>
                      </div>
                    </div>

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
                          : "View Past Predictions"}
                      </button>
                    </div>
                  </div>

                  {/* Right Panel - Plan Info */}
                  <div className="lg:w-1/3 p-8 lg:p-12 bg-gradient-to-br from-gray-50/50 via-white/50 to-gray-100/50 backdrop-blur-md border-l border-white/20">
                    {(!subscriptionPlan || subscriptionPlan === "Free") && (
                      <div className="space-y-8">
                        <div className="text-center">
                          <h3 className="text-2xl font-bold text-gray-800 mb-2">
                            Upgrade to Gold Plan
                          </h3>
                          <div className="bg-yellow-100/90 rounded-xl p-3 mb-4 transform hover:scale-[1.02] transition-all duration-300 shadow-sm">
                            <p className="text-yellow-800 font-semibold">
                              Special Offer!
                            </p>
                            <p className="text-yellow-700 text-sm">
                              Try Premium Features Free for 1 Week
                            </p>
                          </div>
                          <div className="flex items-center justify-center gap-2 mb-6">
                            <span className="text-3xl font-bold bg-gradient-to-r from-yellow-600 to-amber-600 bg-clip-text text-transparent">
                              ₹999
                            </span>
                            <span className="text-gray-600 text-sm">
                              /month
                            </span>
                          </div>
                        </div>

                        <div className="space-y-4">
                          <div className="bg-white rounded-xl p-4 shadow-sm hover:shadow-md transition-all duration-300">
                            <div className="flex items-start gap-3">
                              <div className="bg-yellow-100 rounded-full p-2 mt-0.5">
                                <svg
                                  className="w-4 h-4 text-yellow-600"
                                  fill="currentColor"
                                  viewBox="0 0 20 20"
                                >
                                  <path d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" />
                                </svg>
                              </div>
                              <div>
                                <h4 className="font-semibold text-gray-800">
                                  Unlimited Predictions
                                </h4>
                                <p className="text-gray-600 text-sm">
                                  No restrictions on predictions
                                </p>
                              </div>
                            </div>
                          </div>

                          <div className="bg-white rounded-xl p-4 shadow-sm hover:shadow-md transition-all duration-300">
                            <div className="flex items-start gap-3">
                              <div className="bg-yellow-100 rounded-full p-2 mt-0.5">
                                <svg
                                  className="w-4 h-4 text-yellow-600"
                                  fill="currentColor"
                                  viewBox="0 0 20 20"
                                >
                                  <path d="M5.5 13a3.5 3.5 0 01-.369-6.98 4 4 0 117.753-1.977A4.5 4.5 0 1113.5 13H11V9.413l1.293 1.293a1 1 0 001.414-1.414l-3-3a1 1 0 00-1.414 0l-3 3a1 1 0 001.414 1.414L9 9.414V13H5.5z" />
                                </svg>
                              </div>
                              <div>
                                <h4 className="font-semibold text-gray-800">
                                  Batch Processing
                                </h4>
                                <p className="text-gray-600 text-sm">
                                  Process multiple files at once
                                </p>
                              </div>
                            </div>
                          </div>

                          <div className="bg-white rounded-xl p-4 shadow-sm hover:shadow-md transition-all duration-300">
                            <div className="flex items-start gap-3">
                              <div className="bg-yellow-100 rounded-full p-2 mt-0.5">
                                <svg
                                  className="w-4 h-4 text-yellow-600"
                                  fill="currentColor"
                                  viewBox="0 0 20 20"
                                >
                                  <path d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-2 0c0 .993-.241 1.929-.668 2.754l-1.524-1.525a3.997 3.997 0 00.078-2.183l1.562-1.562C15.802 8.249 16 9.1 16 10zm-5.165 3.913l1.58 1.58A5.98 5.98 0 0110 16a5.976 5.976 0 01-2.516-.552l1.562-1.562a4.006 4.006 0 001.789.027zm-4.677-2.796a4.002 4.002 0 01-.041-2.08l-.08.08-1.53-1.533A5.98 5.98 0 004 10c0 .954.223 1.856.619 2.657l1.54-1.54zm1.088-6.45A5.974 5.974 0 0110 4c.954 0 1.856.223 2.657.619l-1.54 1.54a4.002 4.002 0 00-2.346.033L7.246 4.668zM12 10a2 2 0 11-4 0 2 2 0 014 0z" />
                                </svg>
                              </div>
                              <div>
                                <h4 className="font-semibold text-gray-800">
                                  Priority Support
                                </h4>
                                <p className="text-gray-600 text-sm">
                                  24/7 premium customer support
                                </p>
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="space-y-3">
                          <button
                            onClick={handleUpgrade}
                            className="w-full bg-gradient-to-r from-yellow-400 to-yellow-600 hover:from-yellow-500 hover:to-yellow-700 text-white rounded-full py-3 px-6 font-semibold transition-all duration-300 shadow-lg hover:shadow-xl transform hover:scale-105 flex items-center justify-center gap-2"
                          >
                            <svg
                              className="w-5 h-5 animate-pulse"
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
                          <p className="text-center text-sm text-gray-500">
                            No credit card required • Cancel anytime
                          </p>
                        </div>
                      </div>
                    )}

                    {subscriptionPlan === "Gold" &&
                      userDetails.subscriptionStatus === "trial" && (
                        <div className="space-y-8">
                          <div className="text-center">
                            <div className="inline-flex items-center px-4 py-2 bg-yellow-400/20 rounded-full font-semibold backdrop-blur-sm">
                              <svg
                                className="w-5 h-5 mr-2"
                                fill="currentColor"
                                viewBox="0 0 20 20"
                              >
                                <path
                                  fillRule="evenodd"
                                  d="M5 2a2 2 0 00-2 2v14l3.5-2 3.5 2 3.5-2 3.5 2V4a2 2 0 00-2-2H5zm4.707 3.707a1 1 0 00-1.414-1.414l-3 3a1 1 0 000 1.414l3 3a1 1 0 001.414-1.414L8.414 9H10a3 3 0 013 3v1a1 1 0 102 0v-1a5 5 0 00-5-5H8.414l1.293-1.293z"
                                  clipRule="evenodd"
                                />
                              </svg>
                              TRIAL ACTIVE
                            </div>

                            <h3 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-yellow-600 to-amber-600 mb-6">
                              Trial Period
                            </h3>

                            <div className="bg-white rounded-xl p-6 shadow-md mb-8">
                              <div className="space-y-4">
                                <div>
                                  <p className="text-gray-600">Started:</p>
                                  <p className="text-xl font-semibold text-yellow-700">
                                    {userDetails.trialStartDate
                                      ?.toDate()
                                      .toLocaleDateString("en-IN")}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-gray-600">Ends:</p>
                                  <p className="text-xl font-semibold text-yellow-700">
                                    {userDetails.trialEndDate
                                      ?.toDate()
                                      .toLocaleDateString("en-IN")}
                                  </p>
                                </div>
                                <div className="pt-4 border-t border-gray-100">
                                  <p className="text-2xl font-bold text-yellow-800">
                                    {Math.ceil(
                                      (userDetails.trialEndDate?.toDate() -
                                        new Date()) /
                                        (1000 * 60 * 60 * 24)
                                    )}{" "}
                                    days remaining
                                  </p>
                                </div>
                              </div>
                            </div>

                            {Math.ceil(
                              (userDetails.trialEndDate?.toDate() -
                                new Date()) /
                                (1000 * 60 * 60 * 24)
                            ) <= 2 && (
                              <div className="bg-red-50 border border-red-100 rounded-xl p-4 mb-8">
                                <div className="flex items-center gap-3">
                                  <svg
                                    className="w-6 h-6 text-red-500"
                                    fill="currentColor"
                                    viewBox="0 0 20 20"
                                  >
                                    <path
                                      fillRule="evenodd"
                                      d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                                      clipRule="evenodd"
                                    />
                                  </svg>
                                  <p className="text-red-800 font-medium">
                                    Your trial is ending soon! Upgrade now to
                                    keep your premium features.
                                  </p>
                                </div>
                              </div>
                            )}
                          </div>

                          <div className="space-y-3">
                            <button
                              onClick={handlePremiumUpgrade}
                              className={`${buttonCommonClasses} bg-gradient-to-r from-yellow-400 to-yellow-600 text-white hover:from-yellow-500 hover:to-yellow-700`}
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
                              Monthly plan • Cancel anytime
                            </p>
                          </div>
                        </div>
                      )}

                    {subscriptionPlan === "Gold" &&
                      userDetails.subscriptionStatus === "active" && (
                        <div className="space-y-8">
                          <div className="text-center">
                            <div className="inline-flex items-center px-4 py-2 bg-yellow-400/20 rounded-full font-semibold backdrop-blur-sm">
                              <svg
                                className="w-5 h-5 mr-2"
                                fill="currentColor"
                                viewBox="0 0 20 20"
                              >
                                <path
                                  fillRule="evenodd"
                                  d="M5 2a2 2 0 00-2 2v14l3.5-2 3.5 2 3.5-2 3.5 2V4a2 2 0 00-2-2H5zm4.707 3.707a1 1 0 00-1.414-1.414l-3 3a1 1 0 000 1.414l3 3a1 1 0 001.414-1.414L8.414 9H10a3 3 0 013 3v1a1 1 0 102 0v-1a5 5 0 00-5-5H8.414l1.293-1.293z"
                                  clipRule="evenodd"
                                />
                              </svg>
                              GOLD MEMBER
                            </div>

                            <h3 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-yellow-600 to-amber-600 mb-6">
                              Premium Features Active
                            </h3>

                            <div className="bg-white rounded-xl p-6 shadow-md mb-8">
                              <div className="space-y-4">
                                <div>
                                  <p className="text-gray-600">Started:</p>
                                  <p className="text-xl font-semibold text-yellow-700">
                                    {userDetails.subscriptionStartDate
                                      ?.toDate()
                                      .toLocaleDateString("en-IN")}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-gray-600">Next Billing:</p>
                                  <p className="text-xl font-semibold text-yellow-700">
                                    {userDetails.subscriptionEndDate
                                      ?.toDate()
                                      .toLocaleDateString("en-IN")}
                                  </p>
                                </div>
                                <div className="pt-4 border-t border-gray-100">
                                  <div className="flex items-center justify-center gap-2">
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
                                    <p className="text-2xl font-bold text-green-600">
                                      Active Subscription
                                    </p>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>

                          <div className="space-y-3">
                            <button
                              onClick={() =>
                                window.open(
                                  "https://billing.stripe.com/p/login/test_28o28Z1Ox3mL3GE288",
                                  "_blank"
                                )
                              }
                              className={`${buttonCommonClasses} bg-gradient-to-r from-gray-100 to-gray-200 text-gray-700 hover:from-gray-200 hover:to-gray-300`}
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
                                  d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                                />
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth="2"
                                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                                />
                              </svg>
                              Manage Subscription
                            </button>
                            <p className="text-center text-sm text-gray-500">
                              Monthly billing • Premium support included
                            </p>
                          </div>
                        </div>
                      )}
                  </div>
                </div>
              </div>

              {/* Prediction History Section */}
              {showPredictions && (
                <div className="mt-8 bg-white/80 backdrop-blur-lg rounded-[2rem] shadow-xl border border-white/20 overflow-hidden p-8">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-xl font-bold text-gray-800">
                        Prediction History
                      </h3>
                      <div className="h-0.5 w-20 bg-[#1d5a7b] rounded"></div>
                    </div>
                  </div>

                  {/* Search and Filter Section */}
                  <div className="mb-6 space-y-4 sm:space-y-0 sm:flex sm:gap-4">
                    <div className="flex-1">
                      <div className="relative w-64">
                        <input
                          type="text"
                          placeholder="Search by Customer ID..."
                          value={searchCustomerId}
                          onChange={(e) => setSearchCustomerId(e.target.value)}
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
                        className={`p-1.5 rounded-md border border-gray-200 hover:bg-gray-50 focus:outline-none focus:ring-1 focus:ring-[#1d5a7b] focus:border-[#1d5a7b] transition-colors duration-200 ${
                          dateRange.startDate || dateRange.endDate
                            ? "bg-gray-100 text-gray-700"
                            : "bg-gray-50 text-gray-400"
                        }`}
                        disabled={!dateRange.startDate && !dateRange.endDate}
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

                  {loading ? (
                    <div className="flex justify-center items-center p-6">
                      <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-[#1d5a7b]"></div>
                    </div>
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
                        No prediction history found. Make some predictions to
                        see them here!
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
    </div>
  );
};

export default Profile;
