import React from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useState, useEffect, useRef } from "react";
import { auth, db } from "./firebase";
import { doc, getDoc, deleteDoc } from "firebase/firestore";
import {
  FaExclamationTriangle,
  FaCheckCircle,
  FaDownload,
} from "react-icons/fa";
import html2pdf from "html2pdf.js";
import ReactDOM from "react-dom";
import App from "../App";

const PredictionDetail = () => {
  const { predictionId } = useParams();
  const [prediction, setPrediction] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const contentRef = useRef(null);
  const mainContentRef = useRef(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const fetchPredictionDetail = async () => {
      setLoading(true);
      try {
        const currentUser = auth.currentUser;
        if (!currentUser) {
          setError("You must be logged in to view prediction details");
          setLoading(false);
          return;
        }

        if (!predictionId) {
          setError("No prediction ID provided");
          setLoading(false);
          return;
        }

        const predictionRef = doc(
          db,
          "Users",
          currentUser.uid,
          "predictions",
          predictionId
        );

        const predictionSnap = await getDoc(predictionRef);

        if (predictionSnap.exists()) {
          const data = predictionSnap.data();
          setPrediction({
            id: predictionSnap.id,
            ...data,
            date: data.timestamp
              ? new Date(data.timestamp.toDate()).toLocaleString()
              : "Unknown date",
            stay_probability: data.churn_probability
              ? 1 - data.churn_probability
              : 0,
            confidence_score:
              data.confidence_score ||
              Math.round((1 - Math.abs(0.5 - data.churn_probability)) * 100),
          });
        } else {
          setError("Prediction not found");
        }
      } catch (err) {
        console.error("Error fetching prediction details:", err);
        setError("Failed to load prediction details");
      } finally {
        setLoading(false);
      }
    };

    fetchPredictionDetail();
  }, [predictionId]);

  const handleBack = () => {
    navigate("/Account");
  };

  const handleDelete = async () => {
    setShowConfirmModal(true);
  };

  const confirmDelete = async () => {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        setError("You must be logged in to delete prediction");
        return;
      }

      const predictionRef = doc(
        db,
        "Users",
        currentUser.uid,
        "predictions",
        predictionId
      );

      await deleteDoc(predictionRef);
      navigate("/Account");
    } catch (err) {
      console.error("Error deleting prediction:", err);
      setError("Failed to delete prediction");
    } finally {
      setShowConfirmModal(false);
    }
  };

  const handleDownload = () => {
    if (isSaving) return;
    setIsSaving(true);

    try {
      // Store the main app container reference
      const mainContainer = document.getElementById("root");
      const originalContent = mainContainer.innerHTML;

      // Store current body style
      const originalBodyStyle = document.body.style.cssText;
      const originalBodyClass = document.body.className;

      // Temporarily modify the document for printing
      document.body.style.backgroundColor = "white";
      document.body.style.padding = "0";
      document.body.style.margin = "0";
      document.body.className = "";

      // Only show the content we want to print
      if (contentRef.current) {
        mainContainer.innerHTML = contentRef.current.outerHTML;
      }

      // Print the document
      window.print();

      // Restore the original content and styles
      mainContainer.innerHTML = originalContent;
      document.body.style.cssText = originalBodyStyle;
      document.body.className = originalBodyClass;
    } catch (error) {
      console.error("Error during print:", error);
      alert("Failed to generate PDF. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  // Add print-specific styles
  useEffect(() => {
    // Create a style element for print media
    const style = document.createElement("style");
    style.media = "print";
    style.innerHTML = `
      @page {
        size: auto;
        margin: 20mm;
      }
      @media print {
        body {
          background: white !important;
          padding: 0 !important;
          margin: 0 !important;
        }
        .no-print {
          display: none !important;
        }
        .print-content {
          padding: 20px !important;
          margin: 0 !important;
          box-shadow: none !important;
          background: white !important;
        }
        .print-content * {
          color-adjust: exact !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
      }
    `;
    document.head.appendChild(style);

    return () => {
      document.head.removeChild(style);
    };
  }, []);

  // Helper function to format field names for display
  const formatFieldName = (fieldName) => {
    if (fieldName === "SatisfactionScore") {
      return "Calculated Satisfaction Score";
    }
    return fieldName
      .replace(/([A-Z])/g, " $1")
      .replace(/^./, (str) => str.toUpperCase());
  };

  // Group form data fields into categories
  const groupFields = (formData) => {
    const groups = {
      "Customer Information": [
        "CustomerID",
        "Gender",
        "MaritalStatus",
        "CityTier",
        "Tenure",
      ],
      "Shopping Behavior": [
        "PreferredLoginDevice",
        "PreferredPaymentMode",
        "PreferedOrderCat",
        "OrderCount",
        "DaySinceLastOrder",
      ],
      "Financial Metrics": [
        "OrderAmountHikeFromlastYear",
        "CouponUsed",
        "CashbackAmount",
      ],
      "Engagement Metrics": [
        "HourSpendOnApp",
        "NumberOfDeviceRegistered",
        "SatisfactionScore",
        "NumberOfAddress",
        "Complain",
        "WarehouseToHome",
      ],
    };

    const fieldsByGroup = {};
    Object.keys(groups).forEach((groupName) => {
      fieldsByGroup[groupName] = [];
    });

    Object.entries(formData).forEach(([field, value]) => {
      let assigned = false;
      Object.entries(groups).forEach(([groupName, fields]) => {
        if (fields.includes(field)) {
          // If it's CustomerID, add it at the beginning of the array
          if (field === "CustomerID") {
            fieldsByGroup[groupName].unshift({ field, value });
          } else {
            fieldsByGroup[groupName].push({ field, value });
          }
          assigned = true;
        }
      });

      if (!assigned) {
        if (!fieldsByGroup["Other"]) {
          fieldsByGroup["Other"] = [];
        }
        fieldsByGroup["Other"].push({ field, value });
      }
    });

    return fieldsByGroup;
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#1d5a7b]"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="m-4 p-6 bg-red-50 border border-red-200 rounded-lg">
        <h2 className="text-xl font-bold text-red-700 mb-2">Error</h2>
        <p className="text-red-600">{error}</p>
        <button
          onClick={handleBack}
          className="mt-4 px-4 py-2 bg-[#1d5a7b] text-white rounded-full hover:bg-[#164e68] transition-colors"
        >
          Back to Profile
        </button>
      </div>
    );
  }

  if (!prediction) {
    return (
      <div className="m-4 p-6 bg-yellow-50 border border-yellow-200 rounded-lg">
        <h2 className="text-xl font-bold text-yellow-700 mb-2">Not Found</h2>
        <p className="text-yellow-600">
          Prediction details could not be found.
        </p>
        <button
          onClick={handleBack}
          className="mt-4 px-4 py-2 bg-[#1d5a7b] text-white rounded-full hover:bg-[#164e68] transition-colors"
        >
          Back to Profile
        </button>
      </div>
    );
  }

  const groupedFields = groupFields(prediction.formData || {});

  return (
    <div
      ref={mainContentRef}
      className="min-h-screen pt-32 flex flex-col items-center bg-gradient-to-br from-gray-50 via-white to-gray-100"
    >
      {/* Header Section */}
      <div className="w-full max-w-4xl mb-6 no-print">
        <div className="flex justify-between items-center bg-white shadow-lg rounded-lg p-6">
          <div>
            <h2 className="text-2xl font-bold font-serif mb-2">
              Prediction Details
            </h2>
            <p className="text-sm text-gray-600">
              Prediction made on: {prediction.date}
            </p>
          </div>
          <div className="space-x-2 flex items-center">
            <button
              onClick={handleDownload}
              disabled={isSaving}
              className="inline-flex items-center px-6 py-2.5 bg-blue-500 text-white text-sm rounded-full hover:bg-blue-600 transition-all shadow-md hover:scale-105 duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSaving ? (
                <span className="flex items-center">
                  <span className="animate-spin mr-2">↻</span>
                  Preparing...
                </span>
              ) : (
                <>
                  <FaDownload className="w-4 h-4 mr-2" />
                  Save as PDF
                </>
              )}
            </button>
            <button
              onClick={() => setShowConfirmModal(true)}
              className="px-6 py-2.5 bg-red-500 text-white text-sm rounded-full hover:bg-red-600 transition-all shadow-md hover:scale-105 duration-300"
            >
              Delete Prediction
            </button>
            <button
              onClick={handleBack}
              className="px-6 py-2.5 bg-gray-500 text-white text-sm rounded-full hover:bg-gray-600 transition-all shadow-md hover:scale-105 duration-300"
            >
              Back to Profile
            </button>
          </div>
        </div>
      </div>

      {/* Content to be printed */}
      <div ref={contentRef} className="w-full max-w-4xl print-content">
        <div className="bg-white rounded-lg shadow-lg overflow-hidden">
          <div className="p-8">
            {/* Company Logo and Header */}
            <div className="flex items-center justify-center mb-8">
              <h1 className="text-2xl font-bold text-gray-800">
                Customer Churn Prediction Report
              </h1>
            </div>

            {/* Prediction Header */}
            <div className="flex flex-col items-center justify-center mb-8">
              <div
                className={`text-6xl mb-4 ${prediction.prediction === 1 ? "text-red-500" : "text-green-500"}`}
              >
                {prediction.prediction === 1 ? (
                  <FaExclamationTriangle />
                ) : (
                  <FaCheckCircle />
                )}
              </div>
              <h2
                className={`text-2xl font-bold mb-2 ${prediction.prediction === 1 ? "text-red-600" : "text-green-600"}`}
              >
                {prediction.prediction === 1
                  ? "High Risk of Churn"
                  : "Likely to Stay"}
              </h2>
              <div className="text-gray-600 text-center">
                <p className="text-lg">
                  Confidence Score: {prediction.confidence_score}%
                </p>
                <p className="text-sm mt-1">
                  Churn Probability:{" "}
                  {(prediction.churn_probability * 100).toFixed(1)}% | Stay
                  Probability: {(prediction.stay_probability * 100).toFixed(1)}%
                </p>
              </div>
            </div>

            {/* Customer Behavior Analysis */}
            <div
              className={`p-4 rounded-lg mb-6 ${prediction.prediction === 1 ? "bg-red-50" : "bg-green-50"}`}
            >
              <h3 className="text-lg font-semibold text-gray-800 mb-2">
                Customer Behavior Analysis
              </h3>
              <p
                className={`text-sm leading-relaxed ${prediction.prediction === 1 ? "text-red-700" : "text-green-700"}`}
              >
                {prediction.prediction === 1 ? (
                  <>
                    {`This ${parseInt(prediction.formData?.Tenure || 0) > 12 ? "long-term" : ""}${parseInt(prediction.formData?.Tenure || 0) <= 12 && parseInt(prediction.formData?.Tenure || 0) > 6 ? "moderately established" : ""}${parseInt(prediction.formData?.Tenure || 0) <= 6 ? "relatively new" : ""} customer (${prediction.formData?.Tenure || 0} months) shows concerning signals. `}
                    {parseInt(prediction.formData?.SatisfactionScore || 0) <=
                      2 && "Their satisfaction score is notably low. "}
                    {parseInt(prediction.formData?.OrderCount || 0) <= 2
                      ? "Limited ordering history is a risk factor. "
                      : ""}
                    {parseInt(prediction.formData?.DaySinceLastOrder || 0) >
                      30 && "Extended period of inactivity is concerning. "}
                    {prediction.formData?.Complain === "1" &&
                      "There are unresolved complaints that need immediate attention."}
                  </>
                ) : (
                  <>
                    {`This ${parseInt(prediction.formData?.Tenure || 0) > 12 ? "long-term" : ""}${parseInt(prediction.formData?.Tenure || 0) <= 12 && parseInt(prediction.formData?.Tenure || 0) > 6 ? "moderately established" : ""}${parseInt(prediction.formData?.Tenure || 0) <= 6 ? "relatively new" : ""} customer (${prediction.formData?.Tenure || 0} months) shows positive engagement. `}
                    {parseInt(prediction.formData?.SatisfactionScore || 0) >=
                      4 &&
                      "High satisfaction score indicates strong relationship. "}
                    {parseInt(prediction.formData?.OrderCount || 0) > 5
                      ? "Regular ordering pattern demonstrates loyalty. "
                      : ""}
                    {parseInt(prediction.formData?.DaySinceLastOrder || 0) <=
                      7 && "Recent activity shows active engagement. "}
                    {prediction.formData?.Complain === "0" &&
                      "No complaints indicate satisfaction with service."}
                  </>
                )}
              </p>
            </div>

            {/* Key Metrics Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div
                className={`p-4 rounded-lg ${prediction.prediction === 1 ? "bg-red-50" : "bg-green-50"}`}
              >
                <p className="text-sm text-gray-600">Satisfaction Score</p>
                <p className="text-xl font-bold">
                  {prediction.formData?.SatisfactionScore || 0}/5
                </p>
              </div>
              <div
                className={`p-4 rounded-lg ${prediction.prediction === 1 ? "bg-red-50" : "bg-green-50"}`}
              >
                <p className="text-sm text-gray-600">Customer Tenure</p>
                <p className="text-xl font-bold">
                  {prediction.formData?.Tenure || 0} months
                </p>
              </div>
              <div
                className={`p-4 rounded-lg ${prediction.prediction === 1 ? "bg-red-50" : "bg-green-50"}`}
              >
                <p className="text-sm text-gray-600">Order Count</p>
                <p className="text-xl font-bold">
                  {prediction.formData?.OrderCount || 0}
                </p>
              </div>
              <div
                className={`p-4 rounded-lg ${prediction.prediction === 1 ? "bg-red-50" : "bg-green-50"}`}
              >
                <p className="text-sm text-gray-600">Last Order</p>
                <p className="text-xl font-bold">
                  {prediction.formData?.DaySinceLastOrder || 0} days ago
                </p>
              </div>
            </div>

            {/* Analysis Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Key Indicators */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-gray-800">
                  Key Indicators
                </h3>

                {/* Positive Indicators */}
                <div className="ml-4">
                  <h4 className="text-green-600 font-medium mb-2">
                    Positive Signals:
                  </h4>
                  <ul className="list-disc list-inside text-gray-600 space-y-1">
                    {parseInt(prediction.formData?.Tenure || 0) > 12 && (
                      <li>Long-term customer relationship</li>
                    )}
                    {parseInt(prediction.formData?.SatisfactionScore || 0) >=
                      4 && <li>High satisfaction score</li>}
                    {parseInt(prediction.formData?.OrderCount || 0) > 5 && (
                      <li>Regular ordering pattern</li>
                    )}
                    {prediction.formData?.Complain === "0" && (
                      <li>No complaints filed</li>
                    )}
                    {parseFloat(
                      prediction.formData?.OrderAmountHikeFromlastYear || 0
                    ) > 15 && <li>Strong order value growth</li>}
                    {parseInt(
                      prediction.formData?.NumberOfDeviceRegistered || 0
                    ) >= 3 && <li>Multi-device engagement</li>}
                  </ul>
                </div>

                {/* Risk Factors */}
                <div className="ml-4">
                  <h4 className="text-red-600 font-medium mb-2">
                    Risk Factors:
                  </h4>
                  <ul className="list-disc list-inside text-gray-600 space-y-1">
                    {parseInt(prediction.formData?.Tenure || 0) < 3 && (
                      <li>Very short tenure</li>
                    )}
                    {parseInt(prediction.formData?.SatisfactionScore || 0) <=
                      2 && <li>Low satisfaction score</li>}
                    {parseInt(prediction.formData?.OrderCount || 0) <= 2 && (
                      <li>Low order count</li>
                    )}
                    {prediction.formData?.Complain === "1" && (
                      <li>Has filed complaints</li>
                    )}
                    {parseFloat(
                      prediction.formData?.OrderAmountHikeFromlastYear || 0
                    ) < 10 && <li>Low order value growth</li>}
                    {parseInt(prediction.formData?.DaySinceLastOrder || 0) >
                      30 && <li>Long time since last order</li>}
                  </ul>
                </div>
              </div>

              {/* Action Plan */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-gray-800">
                  Action Plan
                </h3>
                <div
                  className={`p-4 rounded-lg ${prediction.prediction === 1 ? "bg-red-50" : "bg-green-50"}`}
                >
                  <ul className="space-y-3">
                    {prediction.prediction === 1 ? (
                      <>
                        <li className="flex items-start">
                          <span className="mr-2">🎯</span>
                          <span>Initiate personalized retention campaign</span>
                        </li>
                        <li className="flex items-start">
                          <span className="mr-2">💰</span>
                          <span>
                            Offer loyalty rewards worth{" "}
                            {Math.round(
                              (prediction.formData?.CashbackAmount || 0) * 1.5
                            )}{" "}
                            points
                          </span>
                        </li>
                        <li className="flex items-start">
                          <span className="mr-2">📞</span>
                          <span>Schedule customer satisfaction follow-up</span>
                        </li>
                        <li className="flex items-start">
                          <span className="mr-2">🎁</span>
                          <span>
                            Send special discount for{" "}
                            {prediction.formData?.PreferedOrderCat ||
                              "preferred category"}
                          </span>
                        </li>
                      </>
                    ) : (
                      <>
                        <li className="flex items-start">
                          <span className="mr-2">🌟</span>
                          <span>Maintain excellent service standards</span>
                        </li>
                        <li className="flex items-start">
                          <span className="mr-2">📈</span>
                          <span>Consider upselling premium services</span>
                        </li>
                        <li className="flex items-start">
                          <span className="mr-2">🤝</span>
                          <span>Invite to loyalty program benefits</span>
                        </li>
                        <li className="flex items-start">
                          <span className="mr-2">📊</span>
                          <span>Monitor satisfaction trends</span>
                        </li>
                      </>
                    )}
                  </ul>
                </div>
              </div>
            </div>
          </div>

          {/* Detailed Customer Data Section */}
          <div className="p-6">
            <h3 className="text-lg font-semibold mb-4">
              Detailed Customer Data
            </h3>
            <div className="bg-gray-50 p-4 rounded-lg">
              {Object.entries(groupedFields).map(
                ([groupName, fields]) =>
                  fields.length > 0 && (
                    <div key={groupName} className="mb-4 last:mb-0">
                      <h5 className="text-sm font-medium text-[#1d5a7b] mb-2">
                        {groupName}
                      </h5>
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                        {fields.map(({ field, value }) => (
                          <div
                            key={field}
                            className="bg-white p-3 rounded shadow-sm"
                          >
                            <p className="text-xs text-gray-600">
                              {formatFieldName(field)}
                            </p>
                            <p className="font-medium text-sm">{value}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg shadow-xl max-w-md w-full mx-4">
            <h2 className="text-xl font-bold mb-4">Confirm Deletion</h2>
            <p className="mb-6 text-gray-600">
              Are you sure you want to delete this prediction? This action
              cannot be undone.
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setShowConfirmModal(false)}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-full hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                className="px-4 py-2 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PredictionDetail;
