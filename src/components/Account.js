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
          <>
            <div className="max-w-7xl mx-auto">
              <div
                className={`relative shadow-2xl w-[95%] max-w-5xl mx-auto mb-8 ${hasGoldAccess() ? "premium-gold-card" : "glass-card"}`}
              >
                <div className="flex flex-col md:flex-row h-full">
                  {/* Left side - User info */}
                  <div className="p-10 md:p-14 md:w-3/5 relative z-10">
                    <div className="mb-6 flex justify-between items-center">
                      <div>
                        <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-1">
                          Account
                        </h3>
                        <div className="h-1 w-12 bg-[#1d5a7b] rounded"></div>
                      </div>
                      {hasGoldAccess() && (
                        <div className="gold-member-badge text-white text-sm font-bold flex items-center gap-2 bg-gradient-to-r from-yellow-400 to-yellow-600 py-1 px-4 rounded-full shadow-md">
                          <svg
                            className="w-4 h-4"
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
                      )}
                    </div>

                    <div className="mb-8">
                      <h1 className="text-5xl font-bold mb-1 bg-gradient-to-r from-gray-800 to-gray-600 bg-clip-text text-transparent">
                        {userDetails.firstName}
                      </h1>
                      <h2 className="text-4xl font-bold bg-gradient-to-r from-gray-600 to-gray-400 bg-clip-text text-transparent mb-4">
                        {userDetails.lastName}
                      </h2>
                      <p className="text-gray-600 text-lg">
                        Customer at Churn Prediction Service.
                        <br />
                        Currently using our AI prediction tools.
                      </p>
                    </div>

                    <div className="mb-8 space-y-4">
                      <div className="flex items-center gap-4">
                        <span className="text-gray-500 w-24">First name:</span>
                        <span className="font-medium">
                          {userDetails.firstName}
                        </span>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="text-gray-500 w-24">Last name:</span>
                        <span className="font-medium">
                          {userDetails.lastName}
                        </span>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="text-gray-500 w-24">Email:</span>
                        <span className="font-medium">{userDetails.email}</span>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-4">
                      <button
                        onClick={handleLogout}
                        className="bg-red-500 text-white rounded-full font-medium hover:scale-105 duration-300 py-3 px-8 hover:bg-red-600 transition-all shadow-lg hover:shadow-xl flex items-center gap-2"
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
                        className="bg-[#1d5a7b] text-white rounded-full font-medium hover:scale-105 duration-300 py-3 px-8 hover:bg-[#164e68] transition-all shadow-lg hover:shadow-xl flex items-center gap-2"
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

                  {/* Right side - Plan section */}
                  <div className="md:w-2/5 p-8 flex flex-col justify-center items-stretch relative z-10 h-full">
                    {(!subscriptionPlan || subscriptionPlan === "Free") &&
                      renderFreeUserPromotion()}
                    {subscriptionPlan === "Gold" &&
                      userDetails.subscriptionStatus === "trial" &&
                      renderTrialContent()}
                    {subscriptionPlan === "Gold" &&
                      userDetails.subscriptionStatus === "active" &&
                      renderPremiumContent()}
                  </div>
                </div>
              </div>

              {/* Prediction History Section */}
              {showPredictions && (
                <div
                  className={`mt-8 w-full max-w-4xl mx-auto ${hasGoldAccess() ? "premium-gold-card" : "glass-card"} p-6 transform transition-all duration-300 hover:shadow-2xl`}
                >
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-xl font-bold mb-1">
                        Prediction History
                      </h3>
                      <div className="h-0.5 w-20 bg-[#1d5a7b] rounded"></div>
                    </div>
                  </div>

                  {/* Search and Filter Section */}
                  <div className="mb-6 flex flex-col sm:flex-row gap-4">
                    <div className="flex-1">
                      <input
                        type="text"
                        placeholder="Search by Customer ID..."
                        value={searchCustomerId}
                        onChange={(e) => setSearchCustomerId(e.target.value)}
                        className="w-full px-4 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#1d5a7b] focus:border-transparent text-sm"
                      />
                    </div>
                    <div className="flex flex-1 gap-2">
                      <input
                        type="date"
                        value={dateRange.startDate}
                        onChange={(e) =>
                          setDateRange((prev) => ({
                            ...prev,
                            startDate: e.target.value,
                          }))
                        }
                        className="flex-1 px-4 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#1d5a7b] focus:border-transparent text-sm"
                      />
                      <span className="flex items-center text-gray-500">
                        to
                      </span>
                      <input
                        type="date"
                        value={dateRange.endDate}
                        onChange={(e) =>
                          setDateRange((prev) => ({
                            ...prev,
                            endDate: e.target.value,
                          }))
                        }
                        className="flex-1 px-4 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#1d5a7b] focus:border-transparent text-sm"
                      />
                    </div>
                  </div>

                  {loading ? (
                    <div className="flex justify-center items-center p-6">
                      <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-[#1d5a7b]"></div>
                    </div>
                  ) : predictions.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="min-w-full prediction-table text-sm">
                        <thead>
                          <tr>
                            <th className="text-left px-4 py-2 text-xs font-semibold uppercase tracking-wider">
                              Date
                            </th>
                            <th className="text-left px-4 py-2 text-xs font-semibold uppercase tracking-wider">
                              Customer ID
                            </th>
                            <th className="text-left px-4 py-2 text-xs font-semibold uppercase tracking-wider">
                              Prediction
                            </th>
                            <th className="text-left px-4 py-2 text-xs font-semibold uppercase tracking-wider">
                              Churn Probability
                            </th>
                            <th className="text-left px-4 py-2 text-xs font-semibold uppercase tracking-wider">
                              Details
                            </th>
                          </tr>
                        </thead>
                        <tbody className="text-gray-700">
                          {filteredPredictions.map((pred) => (
                            <tr
                              key={pred.id}
                              className="hover:bg-white/5 transition-colors duration-200"
                            >
                              <td className="px-4 py-2">{pred.date}</td>
                              <td className="px-4 py-2">
                                {pred.formData?.CustomerID || "N/A"}
                              </td>
                              <td className="px-4 py-2">
                                <span
                                  className={`px-2 py-1 rounded-full text-xs font-medium ${
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
                              <td className="px-4 py-2">
                                {(pred.churn_probability * 100).toFixed(1)}%
                              </td>
                              <td className="px-4 py-2">
                                <button
                                  onClick={() =>
                                    navigate(`/prediction-detail/${pred.id}`)
                                  }
                                  className="text-[#1d5a7b] hover:text-[#164e68] text-xs font-medium flex items-center gap-1 hover:underline"
                                >
                                  <svg
                                    className="w-3.5 h-3.5"
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
          <div className="flex justify-center items-center h-screen">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#1d5a7b]"></div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Profile;
