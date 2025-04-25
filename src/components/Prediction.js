import React, { useState, useRef, useEffect } from "react";
import { toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import {
  collection,
  addDoc,
  serverTimestamp,
  getDocs,
  query,
  orderBy,
  limit,
  getDoc,
  doc,
  updateDoc,
} from "firebase/firestore";
import { db } from "../firebase";
import { AiOutlineQuestionCircle } from "react-icons/ai";
import Result from "./Result";
import { auth } from "../firebase";
import CsvUpload from "./CsvUpload";
import { useLocation } from "react-router-dom";

// Function to generate a unique customer ID
const generateCustomerId = async () => {
  try {
    // Get the current user
    const user = auth.currentUser;
    if (!user) {
      throw new Error("You must be logged in to generate a customer ID");
    }

    // Get the last prediction to find the highest ID
    const predictionsRef = collection(db, "Users", user.uid, "predictions");
    const q = query(predictionsRef, orderBy("timestamp", "desc"), limit(10));
    const querySnapshot = await getDocs(q);

    let highestId = 0;
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      if (data.formData && data.formData.CustomerID) {
        // Extract numeric part if CustomerID starts with 'C'
        const customerId = data.formData.CustomerID;
        if (customerId.startsWith("C")) {
          const numericPart = parseInt(customerId.substring(1));
          if (!isNaN(numericPart) && numericPart > highestId) {
            highestId = numericPart;
          }
        }
      }
    });

    // Generate next ID
    return `C${(highestId + 1).toString().padStart(5, "0")}`;
  } catch (error) {
    console.error("Error generating customer ID:", error);
    // Fallback to timestamp-based ID if database query fails
    return `C${Date.now().toString().slice(-5)}`;
  }
};

const Prediction = () => {
  const location = useLocation();
  const [showCsvUpload, setShowCsvUpload] = useState(false);
  const [hasPremiumAccess, setHasPremiumAccess] = useState(false);
  const [dailyPredictions, setDailyPredictions] = useState(0);
  const [lastPredictionDate, setLastPredictionDate] = useState(null);

  useEffect(() => {
    const checkUserStatus = async () => {
      try {
        const user = auth.currentUser;
        if (!user) return;

        const userDocRef = doc(db, "Users", user.uid);
        const userDoc = await getDoc(userDocRef);

        if (userDoc.exists()) {
          const userData = userDoc.data();

          // Premium if gold or valid trial
          let premium = false;
          if (userData.subscriptionPlan === "gold") premium = true;
          if (userData.subscriptionPlan === "trial") {
            const trialEnd =
              userData.trialEndDate?.toDate?.() || userData.trialEndDate;
            if (trialEnd && new Date(trialEnd) > new Date()) premium = true;
          }
          setHasPremiumAccess(premium);

          // Check and reset daily predictions if needed
          const today = new Date().toDateString();
          if (userData.lastPredictionDate === today) {
            setDailyPredictions(userData.dailyPredictions || 0);
            setLastPredictionDate(today);
          } else {
            // Reset counter for new day
            setDailyPredictions(0);
            setLastPredictionDate(today);
            await updateDoc(userDocRef, {
              dailyPredictions: 0,
              lastPredictionDate: today,
            });
          }
        }
      } catch (error) {
        console.error("Error checking user status:", error);
      }
    };

    checkUserStatus();
  }, []);

  // Automatically show batch prediction if ?batch=1 is in the URL
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get("batch") === "1") {
      setShowCsvUpload(true);
    }
  }, [location.search]);

  const [formData, setFormData] = useState({
    CustomerID: "",
    Tenure: "",
    PreferredLoginDevice: "",
    CityTier: "",
    WarehouseToHome: "",
    PreferredPaymentMode: "",
    Gender: "",
    HourSpendOnApp: "",
    NumberOfDeviceRegistered: "",
    PreferedOrderCat: "",
    SatisfactionScore: "",
    MaritalStatus: "",
    NumberOfAddress: "",
    Complain: "",
    OrderAmountHikeFromlastYear: "",
    CouponUsed: "",
    OrderCount: "",
    DaySinceLastOrder: "",
    CashbackAmount: "",
  });

  const [prediction, setPrediction] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [formErrors, setFormErrors] = useState({});
  const resultRef = useRef(null);

  // Auto-scroll to results when prediction or error changes
  useEffect(() => {
    if ((prediction || error) && resultRef.current) {
      resultRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [prediction, error]);

  const validateForm = () => {
    const errors = {};
    let isValid = true;

    // Validate required fields except CustomerID
    Object.keys(formData).forEach((field) => {
      if (field !== "CustomerID" && !formData[field] && formData[field] !== 0) {
        errors[field] = "This field is required";
        isValid = false;
      }
    });

    // Validate numeric fields
    const numericFields = [
      "Tenure",
      "WarehouseToHome",
      "HourSpendOnApp",
      "NumberOfDeviceRegistered",
      "SatisfactionScore",
      "NumberOfAddress",
      "OrderAmountHikeFromlastYear",
      "CouponUsed",
      "OrderCount",
      "DaySinceLastOrder",
      "CashbackAmount",
    ];

    numericFields.forEach((field) => {
      if (
        formData[field] &&
        (isNaN(formData[field]) || Number(formData[field]) < 0)
      ) {
        errors[field] = "Please enter a valid positive number";
        isValid = false;
      }
    });

    // Special validation for SatisfactionScore (1-5)
    if (
      formData.SatisfactionScore &&
      (Number(formData.SatisfactionScore) < 1 ||
        Number(formData.SatisfactionScore) > 5)
    ) {
      errors.SatisfactionScore = "Score must be between 1 and 5";
      isValid = false;
    }

    setFormErrors(errors);
    return isValid;
  };

  const handleChange = (e) => {
    const { name, value } = e.target;

    // Check if the field is numeric
    const numericFields = [
      "Tenure",
      "WarehouseToHome",
      "HourSpendOnApp",
      "NumberOfDeviceRegistered",
      "SatisfactionScore",
      "NumberOfAddress",
      "OrderAmountHikeFromlastYear",
      "CouponUsed",
      "OrderCount",
      "DaySinceLastOrder",
      "CashbackAmount",
    ];

    if (numericFields.includes(name)) {
      // Allow empty string (for backspace/delete) or numbers only
      if (value !== "" && !/^\d*\.?\d*$/.test(value)) {
        toast.error("Enter numbers only ! 🙂", {
          position: "top-right",
          autoClose: 2000,
          hideProgressBar: false,
          closeOnClick: true,
          pauseOnHover: true,
          draggable: true,
        });
        return; // Don't update the form if invalid input
      }
    }

    setFormData((prev) => ({ ...prev, [name]: value }));
    // Clear error when user starts typing
    if (formErrors[name]) {
      setFormErrors((prev) => ({ ...prev, [name]: null }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validateForm()) {
      toast.error("Please fix the form errors before submitting");
      return;
    }

    // Check daily prediction limit for free users
    if (!hasPremiumAccess && dailyPredictions >= 20) {
      toast.error(
        "You've reached your daily prediction limit (20). Upgrade to Premium for unlimited predictions!",
        {
          position: "top-center",
          autoClose: 5000,
        }
      );
      return;
    }

    setLoading(true);
    setError(null);
    setPrediction(null);

    try {
      const user = auth.currentUser;
      if (!user) {
        throw new Error("You must be logged in to save predictions");
      }

      // Step 1: Process and validate form data
      let submissionData = { ...formData };
      if (
        !submissionData.CustomerID ||
        submissionData.CustomerID.trim() === ""
      ) {
        try {
          submissionData.CustomerID = await generateCustomerId();
          setFormData(submissionData);
        } catch (idError) {
          console.error("Error generating customer ID:", idError);
          toast.error("Error generating customer ID. Using fallback ID.");
          submissionData.CustomerID = `C${Date.now().toString().slice(-5)}`;
        }
      }

      // Step 2: Data preprocessing and validation
      const processedData = {
        // Numeric fields with validation
        Tenure: parseInt(submissionData.Tenure) || 0,
        CityTier: parseInt(submissionData.CityTier) || 1,
        WarehouseToHome: parseInt(submissionData.WarehouseToHome) || 0,
        HourSpendOnApp: parseFloat(submissionData.HourSpendOnApp) || 0,
        NumberOfDeviceRegistered:
          parseInt(submissionData.NumberOfDeviceRegistered) || 0,
        SatisfactionScore: parseInt(submissionData.SatisfactionScore) || 0,
        NumberOfAddress: parseInt(submissionData.NumberOfAddress) || 0,
        Complain: submissionData.Complain === "Yes" ? 1 : 0,
        OrderAmountHikeFromlastYear:
          parseFloat(submissionData.OrderAmountHikeFromlastYear) || 0,
        CouponUsed: parseInt(submissionData.CouponUsed) || 0,
        OrderCount: parseInt(submissionData.OrderCount) || 0,
        DaySinceLastOrder: parseInt(submissionData.DaySinceLastOrder) || 0,
        CashbackAmount: parseFloat(submissionData.CashbackAmount) || 0,

        // Categorical fields with exact matching
        PreferredLoginDevice: submissionData.PreferredLoginDevice,
        PreferredPaymentMode: submissionData.PreferredPaymentMode,
        Gender: submissionData.Gender,
        PreferedOrderCat: submissionData.PreferedOrderCat,
        MaritalStatus: submissionData.MaritalStatus,
      };

      // Step 3: Validate ranges and business rules
      const validationErrors = [];
      if (
        processedData.SatisfactionScore < 1 ||
        processedData.SatisfactionScore > 5
      ) {
        validationErrors.push("Satisfaction Score must be between 1 and 5");
      }
      if (processedData.Tenure < 0 || processedData.Tenure > 61) {
        validationErrors.push("Tenure must be between 0 and 61 months");
      }
      if (processedData.CityTier < 1 || processedData.CityTier > 3) {
        validationErrors.push("City Tier must be 1, 2, or 3");
      }

      if (validationErrors.length > 0) {
        throw new Error(`Validation failed: ${validationErrors.join(", ")}`);
      }

      // Step 4: Log processed data for debugging
      console.log("Processed data for prediction:", {
        numericFields: {
          Tenure: processedData.Tenure,
          SatisfactionScore: processedData.SatisfactionScore,
          OrderCount: processedData.OrderCount,
          DaySinceLastOrder: processedData.DaySinceLastOrder,
          NumberOfDeviceRegistered: processedData.NumberOfDeviceRegistered,
        },
        categoricalFields: {
          PreferredLoginDevice: processedData.PreferredLoginDevice,
          PreferredPaymentMode: processedData.PreferredPaymentMode,
          Gender: processedData.Gender,
          PreferedOrderCat: processedData.PreferedOrderCat,
          MaritalStatus: processedData.MaritalStatus,
        },
      });

      // Step 5: Send data to backend
      const response = await fetch("http://localhost:5000/predict", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(processedData),
      });

      const result = await response.json();
      console.log("Prediction response:", result);

      if (!response.ok) {
        throw new Error(result.error || "Failed to get prediction");
      }

      // Step 6: Process and format prediction results
      const adjustRiskBasedOnFactors = (originalProbability, formData) => {
        let riskScore = 0;
        let riskFactors = [];

        // Critical Risk Factors
        if (formData.Complain === "1") {
          riskScore += 0.15;
          riskFactors.push("Active Complaints");
        }

        // Tenure Risk
        if (parseInt(formData.Tenure) <= 6) {
          riskScore += 0.1;
          riskFactors.push("New Customer (≤6 months)");
        }

        // Inactivity Risk
        if (parseInt(formData.DaySinceLastOrder) > 30) {
          riskScore += 0.12;
          riskFactors.push("Inactive >30 Days");
        }

        // Low Satisfaction Risk
        if (parseInt(formData.SatisfactionScore) <= 2) {
          riskScore += 0.15;
          riskFactors.push("Low Satisfaction");
        }

        // Low Order Count Risk
        if (parseInt(formData.OrderCount) <= 2) {
          riskScore += 0.08;
          riskFactors.push("Low Order Count");
        }

        // Declining Value Risk
        if (parseFloat(formData.OrderAmountHikeFromlastYear) < 0) {
          riskScore += 0.1;
          riskFactors.push("Declining Order Value");
        }

        // Single Device Risk (less platform commitment)
        if (parseInt(formData.NumberOfDeviceRegistered) === 1) {
          riskScore += 0.05;
          riskFactors.push("Single Device Usage");
        }

        // Adjust the original probability
        let adjustedProb = Math.min(originalProbability + riskScore, 0.95);

        // If multiple critical factors are present, ensure minimum risk level
        if (riskFactors.length >= 3) {
          adjustedProb = Math.max(adjustedProb, 0.4);
        }

        return {
          adjustedProbability: adjustedProb,
          riskFactors: riskFactors,
        };
      };

      const { adjustedProbability, riskFactors } = adjustRiskBasedOnFactors(
        result.churn_probability,
        processedData
      );

      const formattedPrediction = {
        prediction: adjustedProbability > 0.3 ? 1 : 0,
        churn_probability: adjustedProbability,
        stay_probability: 1 - adjustedProbability,
        prediction_label:
          adjustedProbability > 0.3 ? "Likely to Churn" : "Likely to Stay",
        risk_factors: riskFactors,
        confidence_score: Math.round(
          (adjustedProbability > 0.5
            ? adjustedProbability
            : 1 - adjustedProbability) * 100
        ),
      };

      setPrediction(formattedPrediction);

      // Update daily prediction count for free users
      if (!hasPremiumAccess) {
        const today = new Date().toDateString();
        const newCount =
          today === lastPredictionDate ? dailyPredictions + 1 : 1;

        // Update user document with new prediction count
        const userDocRef = doc(db, "Users", user.uid);
        await updateDoc(userDocRef, {
          dailyPredictions: newCount,
          lastPredictionDate: today,
        });

        setDailyPredictions(newCount);
        setLastPredictionDate(today);

        if (newCount >= 15) {
          toast.info(
            `You have ${20 - newCount} predictions remaining today. Consider upgrading to Premium for unlimited predictions!`,
            {
              position: "top-center",
              autoClose: 3000,
            }
          );
        }
      }

      // Show appropriate toast message based on adjusted prediction
      if (formattedPrediction.prediction === 1) {
        if (adjustedProbability > 0.7) {
          toast.error(
            "⚠️ High risk of churn detected! Immediate action required."
          );
        } else {
          toast.warning("⚠️ Moderate churn risk detected. Check action plan.");
        }
      } else {
        if (riskFactors.length > 0) {
          toast.info("✅ Low churn risk, but some risk factors present.");
        } else {
          toast.success("✅ Low churn risk predicted.");
        }
      }
    } catch (err) {
      console.error("Prediction error:", err);
      setError(err.message);
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    setFormData({
      CustomerID: "",
      Tenure: "",
      PreferredLoginDevice: "",
      CityTier: "",
      WarehouseToHome: "",
      PreferredPaymentMode: "",
      Gender: "",
      HourSpendOnApp: "",
      NumberOfDeviceRegistered: "",
      PreferedOrderCat: "",
      SatisfactionScore: "",
      MaritalStatus: "",
      NumberOfAddress: "",
      Complain: "",
      OrderAmountHikeFromlastYear: "",
      CouponUsed: "",
      OrderCount: "",
      DaySinceLastOrder: "",
      CashbackAmount: "",
    });
    setPrediction(null);
    setError(null);
    setFormErrors({});
  };

  return (
    <div className="min-h-screen pt-48 px-4">
      {/* Toggle buttons for prediction type */}
      {hasPremiumAccess && (
        <div className="mb-8 flex justify-center gap-4">
          <button
            className={`px-6 py-3 rounded-2xl font-medium transition-all ${
              !showCsvUpload
                ? "bg-[#1d5a7b] text-white"
                : "bg-gray-200 text-gray-700"
            }`}
            onClick={() => setShowCsvUpload(false)}
          >
            Single Prediction
          </button>
          <button
            className={`px-6 py-3 rounded-2xl font-medium transition-all ${
              showCsvUpload
                ? "bg-[#1d5a7b] text-white"
                : "bg-gray-200 text-gray-700"
            }`}
            onClick={() => setShowCsvUpload(true)}
          >
            Batch Prediction (CSV)
          </button>
        </div>
      )}

      {showCsvUpload ? (
        <CsvUpload key={location.search} />
      ) : (
        <div className="p-4 shadow-md">
          <div className="relative mb-8">
            <h2 className="text-3xl font-medium font-serif text-center">
              Enter Customer Details
            </h2>
            <div className="absolute right-10 top-0 w-48">
              <div className="relative">
                <input
                  type="text"
                  id="CustomerID"
                  name="CustomerID"
                  value={formData.CustomerID}
                  onChange={handleChange}
                  placeholder="Customer ID (Optional)"
                  autoComplete="off"
                  className={`w-full px-4 py-2 text-sm border rounded-lg focus:outline-none focus:ring-1 focus:ring-[#2687b4] ${
                    formErrors.CustomerID ? "border-red-500" : "border-gray-300"
                  }`}
                />
              </div>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 m-4 ">
              {/* Numeric Input Fields */}
              {[
                {
                  id: "Tenure",
                  placeholder: "Tenure",
                  tooltip:
                    "Number of months the customer has stayed with the company, between 0 month and 61 months",
                  min: 0,
                  max: 61,
                },
                {
                  id: "WarehouseToHome",
                  placeholder: "Warehouse To Home",
                  tooltip:
                    "Distance from warehouse to customer's home, between 1 and 130 km/miles",
                  min: 1,
                  max: 130,
                },
                {
                  id: "HourSpendOnApp",
                  placeholder: "Hour Spend On App",
                  tooltip:
                    "Average hours spent on app daily or weekly average usage.",
                  min: 0,
                  max: 5,
                },
                {
                  id: "NumberOfDeviceRegistered",
                  placeholder: "Number Of Device Registered",
                  tooltip:
                    "Number of devices registered by the customer, between 1 and 6 devices",
                  min: 1,
                  max: 6,
                },
                {
                  id: "SatisfactionScore",
                  placeholder: "Calculated Satisfaction Score",
                  tooltip:
                    "Customer satisfaction score (1-5, where 5 is most satisfied)",
                  min: 1,
                  max: 5,
                },
                {
                  id: "NumberOfAddress",
                  placeholder: "Number Of Address",
                  tooltip: "Number of addresses saved in customer's account",
                  min: 1,
                  max: 22,
                },
                {
                  id: "OrderAmountHikeFromlastYear",
                  placeholder: "Order Amount Hike From last Year",
                  tooltip:
                    "how much more the customer spent on orders this year compared to last year. On average, hike is between 11% and 26%",
                  min: 0,
                },
                {
                  id: "CouponUsed",
                  placeholder: "Coupon Used",
                  tooltip: "Number of coupons used by the customer",
                  min: 0,
                  max: 20,
                },
                {
                  id: "OrderCount",
                  placeholder: "Order Count",
                  tooltip: "Total number of orders placed by the customer",
                  min: 1,
                  max: 20,
                },
                {
                  id: "DaySinceLastOrder",
                  placeholder: "Day Since Last Order",
                  tooltip:
                    "How many days have passed since the customer's last order. Ranges from 0 to 52 weeks",
                  min: 0,
                  max: 52,
                },
                {
                  id: "CashbackAmount",
                  placeholder: "Cashback Amount",
                  tooltip: "Average cashback amount received by the customer",
                  min: 0,
                  max: 400,
                },
              ].map((field) => (
                <div key={field.id} className="relative w-full">
                  <input
                    type="text"
                    id={field.id}
                    name={field.id}
                    placeholder=" "
                    value={formData[field.id]}
                    onChange={handleChange}
                    autoComplete="off"
                    onKeyPress={(e) => {
                      if (!/[0-9.]/.test(e.key)) {
                        e.preventDefault();
                        toast.error("Enter numbers only ! 🙂", {
                          position: "top-right",
                          autoClose: 2000,
                          hideProgressBar: false,
                          closeOnClick: true,
                          pauseOnHover: true,
                          draggable: true,
                        });
                      }
                      // Allow only one decimal point
                      if (e.key === "." && formData[field.id].includes(".")) {
                        e.preventDefault();
                      }
                    }}
                    min={field.min}
                    max={field.max}
                    className={`peer block w-full appearance-none border-b-2 bg-transparent px-3 pt-5
                     pb-2 pr-10 text-sm text-gray-900 focus:outline-none focus:ring-0 focus:border-[#2687b4] ${
                       formErrors[field.id]
                         ? "border-red-500"
                         : "border-gray-400"
                     }`}
                    required
                    title=""
                  />
                  <label
                    htmlFor={field.id}
                    className="absolute left-3 top-2 text-sm text-gray-500 duration-300 transform scale-100 -translate-y-1/2
                   origin-[0] peer-placeholder-shown:translate-y-4 peer-placeholder-shown:scale-100 peer-focus:scale-75 peer-focus:-translate-y-1"
                  >
                    {field.placeholder}
                  </label>

                  {/* Tooltip Icon */}
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 z-10 inline-block">
                    <div className="group relative">
                      <AiOutlineQuestionCircle className="text-[#2687b4] text-lg cursor-pointer" />

                      <div
                        className="absolute right-full top-1/2 -translate-y-1/2 mr-2 w-[230px] h-auto  bg-[#155e75] text-white text-[12px] text-center
                    leading-[20px] rounded px-2 z-20 invisible opacity-0 group-hover:visible group-hover:opacity-100
                    transition-opacity duration-300 shadow-lg
                    before:content-[''] before:absolute before:top-1/2 before:right-[-6px] 
                    before:-mt-[6px] before:border-solid before:border-y-transparent before:border-l-transparent before:border-r-[#155e75] 
                    before:border-y-[6px] before:border-r-[6px]"
                      >
                        {field.tooltip}
                      </div>
                    </div>
                  </div>

                  {/* Error */}
                  {formErrors[field.id] && (
                    <p className="text-red-500 text-xs mt-1">
                      {formErrors[field.id]}
                    </p>
                  )}
                </div>
              ))}

              {/* Select Fields */}
              <div>
                <div className="relative w-full">
                  <select
                    id="PreferredLoginDevice"
                    name="PreferredLoginDevice"
                    value={formData.PreferredLoginDevice}
                    onChange={handleChange}
                    autoComplete="off"
                    className={`peer block w-full appearance-none border-b-2 bg-transparent px-3 pt-5 pb-2 pr-10 text-sm text-gray-900 focus:outline-none focus:ring-0 focus:border-[#2687b4] ${
                      formErrors.PreferredLoginDevice
                        ? "border-red-500"
                        : "border-gray-400"
                    }`}
                    required
                    title=""
                  >
                    <option value="" disabled className="text-gray-400">
                      Select Login Device
                    </option>
                    <option value="Mobile Phone">Mobile Phone</option>
                    <option value="Tablet Phone">Tablet Phone</option>
                    <option value="Computer">Computer</option>
                  </select>
                  <label
                    htmlFor="PreferredLoginDevice"
                    className="absolute left-3 top-2 text-sm text-gray-500 duration-300 transform scale-100 -translate-y-1/2 origin-[0] peer-placeholder-shown:translate-y-4 peer-placeholder-shown:scale-100 peer-focus:scale-75 peer-focus:-translate-y-1"
                  >
                    Preferred Login Device
                  </label>
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-[#2687b4]">
                    <svg
                      className="fill-current h-4 w-4"
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 1.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </div>
                  {formErrors.PreferredLoginDevice && (
                    <p className="text-red-500 text-xs mt-1">
                      {formErrors.PreferredLoginDevice}
                    </p>
                  )}
                </div>
              </div>

              <div>
                <div className="relative w-full">
                  <select
                    id="CityTier"
                    name="CityTier"
                    value={formData.CityTier}
                    onChange={handleChange}
                    autoComplete="off"
                    className={`peer block w-full appearance-none border-b-2 bg-transparent px-3 pt-5 pb-2 pr-10 text-sm text-gray-900 focus:outline-none focus:ring-0 focus:border-[#2687b4] ${
                      formErrors.CityTier ? "border-red-500" : "border-gray-400"
                    }`}
                    required
                    title=""
                  >
                    <option value="" disabled className="text-gray-400">
                      Select City Tier
                    </option>
                    <option value="1">Tier 1</option>
                    <option value="2">Tier 2</option>
                    <option value="3">Tier 3</option>
                  </select>
                  <label
                    htmlFor="CityTier"
                    className="absolute left-3 top-2 text-sm text-gray-500 duration-300 transform scale-100 -translate-y-1/2 origin-[0] peer-placeholder-shown:translate-y-4 peer-placeholder-shown:scale-100 peer-focus:scale-75 peer-focus:-translate-y-1"
                  >
                    City Tier
                  </label>
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-[#2687b4]">
                    <svg
                      className="fill-current h-4 w-4"
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 1.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </div>
                  {formErrors.CityTier && (
                    <p className="text-red-500 text-xs mt-1">
                      {formErrors.CityTier}
                    </p>
                  )}
                </div>
              </div>

              <div>
                <div className="relative w-full">
                  <select
                    id="PreferredPaymentMode"
                    name="PreferredPaymentMode"
                    value={formData.PreferredPaymentMode}
                    onChange={handleChange}
                    autoComplete="off"
                    className={`peer block w-full appearance-none border-b-2 bg-transparent px-3 pt-5 pb-2 pr-10 text-sm text-gray-900 focus:outline-none focus:ring-0 focus:border-[#2687b4] ${
                      formErrors.PreferredPaymentMode
                        ? "border-red-500"
                        : "border-gray-400"
                    }`}
                    required
                    title=""
                  >
                    <option value="" disabled className="text-gray-400">
                      Select Payment Mode
                    </option>
                    <option value="Debit Card">Debit Card</option>
                    <option value="Credit Card">Credit Card</option>
                    <option value="UPI">UPI</option>
                    <option value="Cash on Delivery">Cash on Delivery</option>
                    <option value="E wallet">E-wallet</option>
                  </select>
                  <label
                    htmlFor="PreferredPaymentMode"
                    className="absolute left-3 top-2 text-sm text-gray-500 duration-300 transform scale-100 -translate-y-1/2 origin-[0] peer-placeholder-shown:translate-y-4 peer-placeholder-shown:scale-100 peer-focus:scale-75 peer-focus:-translate-y-1"
                  >
                    Preferred Payment Mode
                  </label>
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-[#2687b4]">
                    <svg
                      className="fill-current h-4 w-4"
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 1.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </div>
                  {formErrors.PreferredPaymentMode && (
                    <p className="text-red-500 text-xs mt-1">
                      {formErrors.PreferredPaymentMode}
                    </p>
                  )}
                </div>
              </div>

              <div>
                <div className="relative w-full">
                  <select
                    id="Gender"
                    name="Gender"
                    value={formData.Gender}
                    onChange={handleChange}
                    autoComplete="off"
                    className={`peer block w-full appearance-none border-b-2 bg-transparent px-3 pt-5 pb-2 pr-10 text-sm text-gray-900 focus:outline-none focus:ring-0 focus:border-[#2687b4] ${
                      formErrors.Gender ? "border-red-500" : "border-gray-400"
                    }`}
                    required
                    title=""
                  >
                    <option value="" disabled className="text-gray-400">
                      Select Gender
                    </option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                  </select>
                  <label
                    htmlFor="Gender"
                    className="absolute left-3 top-2 text-sm text-gray-500 duration-300 transform scale-100 -translate-y-1/2 origin-[0] peer-placeholder-shown:translate-y-4 peer-placeholder-shown:scale-100 peer-focus:scale-75 peer-focus:-translate-y-1"
                  >
                    Gender
                  </label>
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-[#2687b4]">
                    <svg
                      className="fill-current h-4 w-4"
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 1.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </div>
                  {formErrors.Gender && (
                    <p className="text-red-500 text-xs mt-1">
                      {formErrors.Gender}
                    </p>
                  )}
                </div>
              </div>

              <div>
                <div className="relative w-full">
                  <select
                    id="PreferedOrderCat"
                    name="PreferedOrderCat"
                    value={formData.PreferedOrderCat}
                    onChange={handleChange}
                    autoComplete="off"
                    className={`peer block w-full appearance-none border-b-2 bg-transparent px-3 pt-5 pb-2 pr-10 text-sm text-gray-900 focus:outline-none focus:ring-0 focus:border-[#2687b4] ${
                      formErrors.PreferedOrderCat
                        ? "border-red-500"
                        : "border-gray-400"
                    }`}
                    required
                    title=""
                  >
                    <option value="" disabled className="text-gray-400">
                      Select Order Category
                    </option>
                    <option value="Laptop & Accessory">
                      Laptop & Accessory
                    </option>
                    <option value="Mobile Phone">Mobile Phone</option>
                    <option value="Fashion">Fashion</option>
                    <option value="Grocery">Grocery</option>
                    <option value="Others">Others</option>
                  </select>
                  <label
                    htmlFor="PreferedOrderCat"
                    className="absolute left-3 top-2 text-sm text-gray-500 duration-300 transform scale-100 -translate-y-1/2 origin-[0] peer-placeholder-shown:translate-y-4 peer-placeholder-shown:scale-100 peer-focus:scale-75 peer-focus:-translate-y-1"
                  >
                    Preferred Order Category
                  </label>
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-[#2687b4]">
                    <svg
                      className="fill-current h-4 w-4"
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 1.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </div>
                  {formErrors.PreferedOrderCat && (
                    <p className="text-red-500 text-xs mt-1">
                      {formErrors.PreferedOrderCat}
                    </p>
                  )}
                </div>
              </div>

              <div>
                <div className="relative w-full">
                  <select
                    id="MaritalStatus"
                    name="MaritalStatus"
                    value={formData.MaritalStatus}
                    onChange={handleChange}
                    autoComplete="off"
                    className={`peer block w-full appearance-none border-b-2 bg-transparent px-3 pt-5 pb-2 pr-10 text-sm text-gray-900 focus:outline-none focus:ring-0 focus:border-[#2687b4] ${
                      formErrors.MaritalStatus
                        ? "border-red-500"
                        : "border-gray-400"
                    }`}
                    required
                    title=""
                  >
                    <option value="" disabled className="text-gray-400">
                      Select Marital Status
                    </option>
                    <option value="Single">Single</option>
                    <option value="Married">Married</option>
                    <option value="Divorced">Divorced</option>
                  </select>
                  <label
                    htmlFor="MaritalStatus"
                    className="absolute left-3 top-2 text-sm text-gray-500 duration-300 transform scale-100 -translate-y-1/2 origin-[0] peer-placeholder-shown:translate-y-4 peer-placeholder-shown:scale-100 peer-focus:scale-75 peer-focus:-translate-y-1"
                  >
                    Marital Status
                  </label>
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-[#2687b4]">
                    <svg
                      className="fill-current h-4 w-4"
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 1.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </div>
                  {formErrors.MaritalStatus && (
                    <p className="text-red-500 text-xs mt-1">
                      {formErrors.MaritalStatus}
                    </p>
                  )}
                </div>
              </div>

              <div>
                <div className="relative w-full">
                  <select
                    id="Complain"
                    name="Complain"
                    value={formData.Complain}
                    onChange={handleChange}
                    autoComplete="off"
                    className={`peer block w-full appearance-none border-b-2 bg-transparent px-3 pt-5 pb-2 pr-10 text-sm text-gray-900 focus:outline-none focus:ring-0 focus:border-[#2687b4] ${
                      formErrors.Complain ? "border-red-500" : "border-gray-400"
                    }`}
                    required
                    title=""
                  >
                    <option value="" disabled className="text-gray-400">
                      Select Complain Status
                    </option>
                    <option value="0">No</option>
                    <option value="1">Yes</option>
                  </select>
                  <label
                    htmlFor="Complain"
                    className="absolute left-3 top-2 text-sm text-gray-500 duration-300 transform scale-100 -translate-y-1/2 origin-[0] peer-placeholder-shown:translate-y-4 peer-placeholder-shown:scale-100 peer-focus:scale-75 peer-focus:-translate-y-1"
                  >
                    Has Complained?
                  </label>
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-[#2687b4]">
                    <svg
                      className="fill-current h-4 w-4"
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 1.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </div>
                  {formErrors.Complain && (
                    <p className="text-red-500 text-xs mt-1">
                      {formErrors.Complain}
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className="flex justify-center gap-6 mt-8 mb-4">
              <button
                type="submit"
                disabled={loading}
                className={`px-6 py-2 rounded-full text-white font-medium text-lg min-w-[140px] transition-all duration-200 ${
                  loading
                    ? "bg-gray-400 cursor-not-allowed"
                    : "bg-[#1d5a7b] hover:bg-[#164e68]"
                }`}
              >
                {loading ? (
                  <div className="flex items-center justify-center">
                    <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-white mr-2"></div>
                    Processing...
                  </div>
                ) : (
                  "Predict"
                )}
              </button>
              <button
                type="button"
                onClick={handleClear}
                className="px-6 py-2 rounded-full border-2 border-[#1d5a7b] text-[#1d5a7b] font-medium text-lg min-w-[140px] hover:bg-gray-200 transition-all duration-200"
              >
                Clear
              </button>
            </div>
          </form>

          {/* Result Component */}
          <div ref={resultRef}>
            <Result prediction={prediction} formData={formData} error={error} />
          </div>
        </div>
      )}
    </div>
  );
};

export default Prediction;
