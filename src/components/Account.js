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
    border-radius: 1.5rem;
    position: relative;
    overflow: hidden;
    box-shadow: 0 10px 30px -5px rgba(189, 161, 61, 0.2);
    backdrop-filter: blur(10px);
    border: 1px solid rgba(255, 255, 255, 0.2);
  }
  
  .premium-gold-card::before {
    content: '';
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

  .gold-member-badge {
    background: linear-gradient(135deg, #ffd700 0%, #ffb347 100%);
    box-shadow: 0 4px 15px rgba(255, 215, 0, 0.3);
    position: relative;
    overflow: hidden;
    border-radius: 9999px;
    padding: 0.5rem 1.5rem;
    font-weight: 600;
    letter-spacing: 0.05em;
  }

  .gold-member-badge::before {
    content: '';
    position: absolute;
    top: 0;
    left: -100%;
    width: 100%;
    height: 100%;
    background: linear-gradient(
      90deg,
      transparent,
      rgba(255, 255, 255, 0.3),
      transparent
    );
    animation: shine 2s infinite;
  }

  .gold-plan-section {
    position: relative;
    overflow: hidden;
    border-radius: 1.5rem;
    padding: 2rem;
    background: linear-gradient(135deg, rgba(255, 255, 255, 0.1) 0%, rgba(255, 255, 255, 0.05) 100%);
    backdrop-filter: blur(10px);
    border: 1px solid rgba(255, 255, 255, 0.1);
  }

  .gold-plan-section::before {
    content: '';
    position: absolute;
    top: 0;
    left: -100%;
    width: 100%;
    height: 100%;
    background: linear-gradient(
      90deg,
      transparent,
      rgba(255, 215, 0, 0.1),
      transparent
    );
    animation: shine 3s infinite;
  }

  .gold-text-shine {
    background: linear-gradient(90deg, #b8860b, #ffd700, #b8860b);
    background-size: 200% auto;
    color: transparent;
    -webkit-background-clip: text;
    background-clip: text;
    animation: goldTextShine 3s linear infinite;
    font-weight: 700;
  }

  .gold-button {
    background: linear-gradient(135deg, #ffd700, #ffa500);
    position: relative;
    overflow: hidden;
    transition: all 0.3s ease;
    box-shadow: 0 4px 15px rgba(255, 215, 0, 0.3);
    border-radius: 9999px;
    padding: 0.75rem 2rem;
    font-weight: 600;
    letter-spacing: 0.05em;
  }

  .gold-button::before {
    content: '';
    position: absolute;
    top: 0;
    left: -100%;
    width: 100%;
    height: 100%;
    background: linear-gradient(
      90deg,
      transparent,
      rgba(255, 255, 255, 0.2),
      transparent
    );
    animation: shine 2s infinite;
  }

  .gold-button:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 20px rgba(255, 215, 0, 0.4);
  }

  .prediction-table {
    background: rgba(255, 255, 255, 0.1);
    backdrop-filter: blur(10px);
    border-radius: 1rem;
    overflow: hidden;
    border: 1px solid rgba(255, 255, 255, 0.1);
  }

  .prediction-table th {
    background: rgba(255, 255, 255, 0.1);
    padding: 1rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    font-size: 0.875rem;
  }

  .prediction-table td {
    padding: 1rem;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  }

  .prediction-table tr:hover {
    background: rgba(255, 255, 255, 0.05);
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

  @keyframes goldTextShine {
    0% {
      background-position: 0% 50%;
    }
    50% {
      background-position: 100% 50%;
    }
    100% {
      background-position: 0% 50%;
    }
  }

  .glass-card {
    background: rgba(255, 255, 255, 0.1);
    backdrop-filter: blur(10px);
    border-radius: 1.5rem;
    border: 1px solid rgba(255, 255, 255, 0.1);
    box-shadow: 0 8px 32px 0 rgba(31, 38, 135, 0.1);
  }

  .feature-list li {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem;
    border-radius: 0.75rem;
    transition: all 0.3s ease;
  }

  .feature-list li:hover {
    background: rgba(255, 255, 255, 0.1);
    transform: translateX(5px);
  }
`;

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

  // Update the free user promotion render function
  const renderFreeUserPromotion = () => (
    <div
      className={`${cardCommonClasses} bg-gradient-to-br from-gray-50/95 via-white/95 to-gray-100/95`}
    >
      <div>
        <div className="text-center mb-2">
          <h3 className="text-xl font-bold mb-2 text-gray-800">
            Upgrade to Gold Plan
          </h3>

          <div className="bg-yellow-100/90 rounded-md p-2 mb-2 transform hover:scale-[1.02] transition-all duration-300 shadow-sm">
            <p className="text-yellow-800 font-semibold text-sm">
              Special Offer!
            </p>
            <p className="text-yellow-700 text-xs">
              Try Premium Features Free for 1 Week
            </p>
          </div>

          <div className="flex items-center justify-center mb-2">
            <div className="text-center">
              <span className="text-2xl font-bold bg-gradient-to-r from-yellow-600 to-amber-600 bg-clip-text text-transparent">
                ₹999
              </span>
              <span className="text-gray-600 text-xs ml-1">/month</span>
            </div>
          </div>
        </div>

        <div className="space-y-2 mb-3">
          <div className="bg-white/80 p-2 rounded-md shadow-sm hover:shadow-md transition-all duration-300 flex items-start gap-2">
            <div className="bg-yellow-100 rounded-full p-1 mt-0.5">
              <svg
                className="w-3 h-3 text-yellow-600"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" />
              </svg>
            </div>
            <div>
              <h4 className="font-semibold text-gray-800 text-sm">
                Unlimited Predictions
              </h4>
              <p className="text-gray-600 text-xs">
                No restrictions on predictions
              </p>
            </div>
          </div>

          <div className="bg-white/80 p-2 rounded-md shadow-sm hover:shadow-md transition-all duration-300 flex items-start gap-2">
            <div className="bg-yellow-100 rounded-full p-1 mt-0.5">
              <svg
                className="w-3 h-3 text-yellow-600"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path d="M5.5 13a3.5 3.5 0 01-.369-6.98 4 4 0 117.753-1.977A4.5 4.5 0 1113.5 13H11V9.413l1.293 1.293a1 1 0 001.414-1.414l-3-3a1 1 0 00-1.414 0l-3 3a1 1 0 001.414 1.414L9 9.414V13H5.5z" />
              </svg>
            </div>
            <div>
              <h4 className="font-semibold text-gray-800 text-sm">
                Batch Processing
              </h4>
              <p className="text-gray-600 text-xs">
                Process multiple files at once
              </p>
            </div>
          </div>

          <div className="bg-white/80 p-2 rounded-md shadow-sm hover:shadow-md transition-all duration-300 flex items-start gap-2">
            <div className="bg-yellow-100 rounded-full p-1 mt-0.5">
              <svg
                className="w-3 h-3 text-yellow-600"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-2 0c0 .993-.241 1.929-.668 2.754l-1.524-1.525a3.997 3.997 0 00.078-2.183l1.562-1.562C15.802 8.249 16 9.1 16 10zm-5.165 3.913l1.58 1.58A5.98 5.98 0 0110 16a5.976 5.976 0 01-2.516-.552l1.562-1.562a4.006 4.006 0 001.789.027zm-4.677-2.796a4.002 4.002 0 01-.041-2.08l-.08.08-1.53-1.533A5.98 5.98 0 004 10c0 .954.223 1.856.619 2.657l1.54-1.54zm1.088-6.45A5.974 5.974 0 0110 4c.954 0 1.856.223 2.657.619l-1.54 1.54a4.002 4.002 0 00-2.346.033L7.246 4.668zM12 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <div>
              <h4 className="font-semibold text-gray-800 text-sm">
                Priority Support
              </h4>
              <p className="text-gray-600 text-xs">
                24/7 premium customer support
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-1">
        <button
          onClick={handleUpgrade}
          className="w-full rounded-full py-2 px-3 text-sm font-semibold transition-all duration-300 shadow-md hover:shadow-lg flex items-center justify-center gap-1.5 transform hover:scale-[1.02] bg-gradient-to-r from-yellow-400 to-yellow-600 text-white hover:from-yellow-500 hover:to-yellow-700 group"
        >
          <svg
            className="w-3.5 h-3.5 group-hover:animate-pulse"
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

        <p className="text-center text-[10px] text-gray-600">
          No credit card required • Cancel anytime
        </p>
      </div>
    </div>
  );

  // Update the trial content render function
  const renderTrialContent = () => {
    const trialEnd = userDetails.trialEndDate?.toDate();
    const trialStart = userDetails.trialStartDate?.toDate();
    const now = new Date();
    const daysLeft = Math.ceil((trialEnd - now) / (1000 * 60 * 60 * 24));
    const isExpiringSoon = daysLeft <= 2;

    return (
      <div
        className={`${cardCommonClasses} bg-gradient-to-br from-yellow-50/95 via-yellow-100/95 to-amber-50/95`}
      >
        <div>
          <div className={badgeClasses}>
            <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M5 2a2 2 0 00-2 2v14l3.5-2 3.5 2 3.5-2 3.5 2V4a2 2 0 00-2-2H5zm4.707 3.707a1 1 0 00-1.414-1.414l-3 3a1 1 0 000 1.414l3 3a1 1 0 001.414-1.414L8.414 9H10a3 3 0 013 3v1a1 1 0 102 0v-1a5 5 0 00-5-5H8.414l1.293-1.293z"
                clipRule="evenodd"
              />
            </svg>
            TRIAL ACTIVE
          </div>

          <div className="text-center">
            <h3 className={`${headingCommonClasses} gold-text-shine`}>
              Trial Period
            </h3>
            <div className={contentCardClasses}>
              <p className="text-gray-700 mb-3 text-base">
                Started:{" "}
                <span className="font-semibold text-yellow-700">
                  {trialStart?.toLocaleDateString("en-IN")}
                </span>
              </p>
              <p className="text-gray-700 mb-3 text-base">
                Ends:{" "}
                <span className="font-semibold text-yellow-700">
                  {trialEnd?.toLocaleDateString("en-IN")}
                </span>
              </p>
              <p className="text-lg font-medium text-yellow-800">
                {daysLeft} days remaining
              </p>
            </div>
          </div>

          {isExpiringSoon && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 transform hover:scale-[1.02] transition-all duration-300 shadow-md">
              <p className="text-red-800 text-base font-medium flex items-center gap-2">
                <svg
                  className="w-5 h-5"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                    clipRule="evenodd"
                  />
                </svg>
                Your trial is ending soon! Upgrade now to keep your premium
                features.
              </p>
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

          <p className="text-center text-sm text-gray-600">
            Monthly plan • Cancel anytime
          </p>
        </div>
      </div>
    );
  };

  // Update the premium content render function
  const renderPremiumContent = () => {
    const startDate = userDetails.subscriptionStartDate?.toDate();
    const endDate = userDetails.subscriptionEndDate?.toDate();

    return (
      <div
        className={`${cardCommonClasses} bg-gradient-to-br from-yellow-50/95 via-yellow-100/95 to-amber-50/95`}
      >
        <div>
          <div className={badgeClasses}>
            <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M5 2a2 2 0 00-2 2v14l3.5-2 3.5 2 3.5-2 3.5 2V4a2 2 0 00-2-2H5zm4.707 3.707a1 1 0 00-1.414-1.414l-3 3a1 1 0 000 1.414l3 3a1 1 0 001.414-1.414L8.414 9H10a3 3 0 013 3v1a1 1 0 102 0v-1a5 5 0 00-5-5H8.414l1.293-1.293z"
                clipRule="evenodd"
              />
            </svg>
            GOLD MEMBER
          </div>

          <div className="text-center">
            <h3 className={`${headingCommonClasses} gold-text-shine`}>
              Premium Features Active
            </h3>
            <div className={contentCardClasses}>
              <p className="text-gray-700 mb-3 text-base">
                Started:{" "}
                <span className="font-semibold text-yellow-700">
                  {startDate?.toLocaleDateString("en-IN")}
                </span>
              </p>
              <p className="text-gray-700 mb-3 text-base">
                Next Billing:{" "}
                <span className="font-semibold text-yellow-700">
                  {endDate?.toLocaleDateString("en-IN")}
                </span>
              </p>
              <p className="text-lg font-medium text-green-600">
                Active Subscription
              </p>
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

          <p className="text-center text-sm text-gray-600">
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100">
      <div className="w-full pt-[140px] md:pt-[160px] pb-12 px-4">
        {isActivating ? (
          <div className="flex flex-col items-center justify-center min-h-[60vh]">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#1d5a7b] mb-4"></div>
            <p className="text-gray-600">Setting up your plan...</p>
          </div>
        ) : userDetails ? (
          <div className="max-w-7xl mx-auto">
            <div className="bg-white rounded-3xl shadow-xl overflow-hidden">
              <div className="flex flex-col lg:flex-row min-h-[600px]">
                {/* Left Sidebar */}
                <div className="lg:w-1/4 bg-gray-50 p-8">
                  <h2 className="text-2xl font-bold text-gray-800 mb-8">
                    Settings
                  </h2>
                  <nav className="space-y-2">
                    <button className="w-full text-left px-4 py-3 rounded-xl bg-blue-50 text-blue-600 font-medium">
                      Account
                    </button>
                    <button className="w-full text-left px-4 py-3 rounded-xl text-gray-600 hover:bg-gray-100 transition-colors">
                      Notifications
                    </button>
                    <button className="w-full text-left px-4 py-3 rounded-xl text-gray-600 hover:bg-gray-100 transition-colors">
                      Privacy
                    </button>
                    <button className="w-full text-left px-4 py-3 rounded-xl text-gray-600 hover:bg-gray-100 transition-colors">
                      Language
                    </button>
                    <button className="w-full text-left px-4 py-3 rounded-xl text-gray-600 hover:bg-gray-100 transition-colors">
                      Help
                    </button>
                  </nav>
                </div>

                {/* Main Content */}
                <div className="lg:w-3/4 p-8">
                  <div className="max-w-3xl">
                    <h1 className="text-3xl font-bold text-gray-800 mb-8">
                      Account Settings
                    </h1>

                    {/* Basic Info Section */}
                    <section className="mb-12">
                      <h3 className="text-lg font-semibold text-gray-700 mb-6">
                        Basic Info
                      </h3>

                      {/* Profile Picture */}
                      <div className="mb-8 flex items-center gap-4">
                        <div className="relative">
                          <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center overflow-hidden">
                            {userDetails.photoURL ? (
                              <img
                                src={userDetails.photoURL}
                                alt="Profile"
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <span className="text-2xl font-bold text-blue-500">
                                {userDetails.firstName?.charAt(0)}
                              </span>
                            )}
                          </div>
                          <button className="absolute bottom-0 right-0 bg-white rounded-full p-1 shadow-md hover:shadow-lg transition-shadow">
                            <svg
                              className="w-4 h-4 text-gray-600"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth="2"
                                d="M12 4v16m8-8H4"
                              />
                            </svg>
                          </button>
                        </div>
                        <div>
                          <button className="text-blue-600 text-sm font-medium hover:underline">
                            Upload new picture
                          </button>
                          <p className="text-gray-500 text-xs mt-1">
                            JPG, GIF or PNG. Max size 2MB
                          </p>
                        </div>
                      </div>

                      {/* User Info Fields */}
                      <div className="space-y-6">
                        <div className="flex items-center justify-between py-4 border-b border-gray-100 hover:bg-gray-50 px-4 rounded-lg transition-colors">
                          <div>
                            <p className="text-sm text-gray-500">Name</p>
                            <p className="font-medium text-gray-900">
                              {userDetails.firstName} {userDetails.lastName}
                            </p>
                          </div>
                          <button className="text-gray-400 hover:text-gray-600">
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
                                d="M9 5l7 7-7 7"
                              />
                            </svg>
                          </button>
                        </div>

                        <div className="flex items-center justify-between py-4 border-b border-gray-100 hover:bg-gray-50 px-4 rounded-lg transition-colors">
                          <div>
                            <p className="text-sm text-gray-500">Email</p>
                            <p className="font-medium text-gray-900">
                              {userDetails.email}
                            </p>
                          </div>
                          <button className="text-gray-400 hover:text-gray-600">
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
                                d="M9 5l7 7-7 7"
                              />
                            </svg>
                          </button>
                        </div>

                        <div className="flex items-center justify-between py-4 border-b border-gray-100 hover:bg-gray-50 px-4 rounded-lg transition-colors">
                          <div>
                            <p className="text-sm text-gray-500">Password</p>
                            <p className="font-medium text-gray-900">
                              ••••••••
                            </p>
                          </div>
                          <button className="text-gray-400 hover:text-gray-600">
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
                                d="M9 5l7 7-7 7"
                              />
                            </svg>
                          </button>
                        </div>
                      </div>
                    </section>

                    {/* Subscription Section */}
                    <section className="mb-12">
                      <h3 className="text-lg font-semibold text-gray-700 mb-6">
                        Subscription
                      </h3>
                      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-6">
                        <div className="flex items-center justify-between mb-4">
                          <div>
                            <h4 className="font-semibold text-gray-800">
                              {subscriptionPlan === "Gold"
                                ? "Gold Plan"
                                : "Free Plan"}
                            </h4>
                            <p className="text-sm text-gray-600">
                              {subscriptionPlan === "Gold"
                                ? userDetails.subscriptionStatus === "trial"
                                  ? "Trial Period"
                                  : "Active Subscription"
                                : "Basic features"}
                            </p>
                          </div>
                          {subscriptionPlan === "Gold" ? (
                            <button
                              onClick={() =>
                                window.open(
                                  "https://billing.stripe.com/p/login/test_28o28Z1Ox3mL3GE288",
                                  "_blank"
                                )
                              }
                              className="px-4 py-2 bg-white text-blue-600 rounded-lg shadow-sm hover:shadow-md transition-all text-sm font-medium"
                            >
                              Manage Plan
                            </button>
                          ) : (
                            <button
                              onClick={handleUpgrade}
                              className="px-4 py-2 bg-blue-600 text-white rounded-lg shadow-sm hover:shadow-md transition-all text-sm font-medium"
                            >
                              Upgrade Plan
                            </button>
                          )}
                        </div>
                      </div>
                    </section>

                    {/* Action Buttons */}
                    <div className="flex flex-wrap gap-4">
                      <button
                        onClick={handleLogout}
                        className="px-6 py-2.5 border border-red-200 text-red-600 rounded-lg hover:bg-red-50 transition-colors font-medium text-sm"
                      >
                        Sign Out
                      </button>
                      <button
                        onClick={togglePredictionHistory}
                        className="px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium text-sm"
                      >
                        {showPredictions ? "Hide History" : "View History"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Prediction History Section */}
            {showPredictions && (
              <div className="mt-8 bg-white rounded-3xl shadow-xl overflow-hidden p-8">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-2xl font-bold text-gray-800">
                    Prediction History
                  </h2>
                </div>
                {/* ... existing prediction history content ... */}
              </div>
            )}
          </div>
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
