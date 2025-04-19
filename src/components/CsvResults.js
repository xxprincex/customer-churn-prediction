import React, { useState, useCallback, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  FaDownload,
  FaExclamationTriangle,
  FaCheckCircle,
  FaChevronUp,
  FaChevronDown,
} from "react-icons/fa";
import { toast } from "react-toastify";
import { auth, db } from "../firebase";
import {
  collection,
  addDoc,
  serverTimestamp,
  doc,
  getDoc,
  writeBatch,
} from "firebase/firestore";
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  BarElement,
} from "chart.js";
import { Pie, Bar } from "react-chartjs-2";

ChartJS.register(
  ArcElement,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  BarElement
);

// Constants for pagination
const ITEMS_PER_PAGE = 50;
const MAX_PAGES_SHOWN = 5;

// Error boundary component
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("Error in CsvResults:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-6 text-center">
          <p className="text-red-500">
            Something went wrong displaying the results.
          </p>
          <button
            onClick={() => this.setState({ hasError: false })}
            className="mt-4 px-4 py-2 bg-[#1d5a7b] text-white rounded-md"
          >
            Try Again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const CsvResults = ({ results, fileName }) => {
  const [viewMode, setViewMode] = useState("summary");
  const [currentPage, setCurrentPage] = useState(1);
  const [sortField, setSortField] = useState("churnProbability");
  const [sortDirection, setSortDirection] = useState("desc");
  const [showHighRiskList, setShowHighRiskList] = useState(false);
  const [showMediumRiskList, setShowMediumRiskList] = useState(false);
  const [showLowRiskList, setShowLowRiskList] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [saveTimeout, setSaveTimeout] = useState(null);
  const navigate = useNavigate();

  // Extract predictions from results prop
  const predictions = useMemo(() => {
    if (
      !results ||
      !results.predictions ||
      !Array.isArray(results.predictions)
    ) {
      return [];
    }
    return results.predictions;
  }, [results]);

  // Error handling for missing or invalid results
  if (!results || !results.predictions || !Array.isArray(results.predictions)) {
    return (
      <div className="p-6 text-center">
        <div className="bg-red-50 p-4 rounded-lg mb-4">
          <FaExclamationTriangle className="mx-auto h-12 w-12 text-red-400 mb-4" />
          <p className="text-red-800 mb-2">Invalid or missing results data</p>
          <p className="text-red-600 text-sm">
            The prediction results could not be processed correctly.
          </p>
        </div>
        <button
          onClick={() => navigate("/csv-upload")}
          className="mt-4 px-4 py-2 bg-[#1d5a7b] text-white rounded-md hover:bg-[#164e68] transition-colors"
        >
          Back to Upload
        </button>
      </div>
    );
  }

  // Memoized data processing
  const {
    totalRecords,
    highRiskCustomers,
    mediumRiskCustomers,
    lowRiskCustomers,
    churnCount,
    stayCount,
    churnPercentage,
    customerHealthScore,
    retentionRateTarget,
    actionPriorityScore,
  } = useMemo(() => {
    const total = predictions.length;

    const highRisk = predictions.filter((p) => p.churnProbability > 0.7);
    const mediumRisk = predictions.filter(
      (p) => p.churnProbability > 0.3 && p.churnProbability <= 0.7
    );
    const lowRisk = predictions.filter((p) => p.churnProbability <= 0.3);

    const churn = predictions.filter((p) => p.prediction === 1).length;
    const stay = total - churn;
    const churnPct = ((churn / total) * 100).toFixed(1);

    return {
      totalRecords: total,
      highRiskCustomers: highRisk,
      mediumRiskCustomers: mediumRisk,
      lowRiskCustomers: lowRisk,
      churnCount: churn,
      stayCount: stay,
      churnPercentage: churnPct,
      customerHealthScore: (
        ((lowRisk.length + mediumRisk.length * 0.5) / total) *
        100
      ).toFixed(1),
      retentionRateTarget: Math.min(95, 100 - parseFloat(churnPct)),
      actionPriorityScore: Math.min(
        100,
        Math.round(
          (highRisk.length / total) * 100 + (mediumRisk.length / total) * 50
        )
      ),
    };
  }, [predictions]);

  // Memoized sorted data
  const sortedData = useMemo(() => {
    const data = [...predictions];
    return data.sort((a, b) => {
      const aValue = a[sortField];
      const bValue = b[sortField];
      return sortDirection === "asc" ? aValue - bValue : bValue - aValue;
    });
  }, [predictions, sortField, sortDirection]);

  // Pagination calculations
  const totalPages = Math.ceil(predictions.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const currentData = sortedData.slice(startIndex, endIndex);

  // Memoized pagination controls
  const paginationControls = useMemo(() => {
    const pages = [];
    let startPage = Math.max(1, currentPage - Math.floor(MAX_PAGES_SHOWN / 2));
    let endPage = Math.min(totalPages, startPage + MAX_PAGES_SHOWN - 1);

    if (endPage - startPage + 1 < MAX_PAGES_SHOWN) {
      startPage = Math.max(1, endPage - MAX_PAGES_SHOWN + 1);
    }

    for (let i = startPage; i <= endPage; i++) {
      pages.push(i);
    }

    return pages;
  }, [currentPage, totalPages]);

  // Handlers
  const handleSort = useCallback(
    (field) => {
      setSortField(field);
      setSortDirection((current) =>
        field === sortField ? (current === "asc" ? "desc" : "asc") : "desc"
      );
    },
    [sortField]
  );

  const handlePageChange = useCallback((page) => {
    setCurrentPage(page);
  }, []);

  const handleDownloadCSV = useCallback(() => {
    const headers = [
      "CustomerID",
      "Prediction",
      "Churn Probability",
      "Stay Probability",
      "Risk Level",
      "Confidence Score",
      "Risk Factors",
    ];

    const csvRows = [
      headers.join(","),
      ...predictions.map((p) => {
        const riskLevel =
          p.churnProbability > 0.7
            ? "High"
            : p.churnProbability > 0.3
              ? "Medium"
              : "Low";

        return [
          p.customerID,
          p.prediction_label,
          p.churnProbability.toFixed(3),
          (1 - p.churnProbability).toFixed(3),
          riskLevel,
          p.confidence_score?.toFixed(1) || "N/A",
          p.risk_factors?.join("; ") || "None",
        ].join(",");
      }),
    ].join("\n");

    const blob = new Blob([csvRows], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.setAttribute("hidden", "");
    a.setAttribute("href", url);
    a.setAttribute("download", `${fileName.split(".")[0]}_predictions.csv`);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, [predictions, fileName]);

  const handleSaveBatchResults = async () => {
    if (isSaving) {
      return;
    }

    if (isSaved) {
      toast.info("Results already saved!");
      return;
    }

    setIsSaving(true);

    const timeout = setTimeout(() => {
      setIsSaving(false);
      toast.error("Save operation timed out. Please try again.");
    }, 30000);
    setSaveTimeout(timeout);

    try {
      const user = auth.currentUser;
      if (!user) {
        throw new Error("Please sign in to save batch predictions");
      }

      if (!results?.predictions?.length) {
        throw new Error("No prediction results to save");
      }

      const userRef = doc(db, "Users", user.uid);
      const userDoc = await getDoc(userRef);

      if (!userDoc.exists()) {
        throw new Error("User profile not found");
      }

      const userData = userDoc.data();
      if (userData.subscriptionPlan !== "Gold" && !userData.trialActive) {
        throw new Error("Batch predictions are only available for Gold users");
      }

      // Create main batch document
      const mainBatchDoc = {
        timestamp: serverTimestamp(),
        fileName: fileName || "batch_predictions.csv",
        totalRecords: results.predictions.length,
        summary: {
          churnCount: results.predictions.filter((p) => p.prediction === 1)
            .length,
          stayCount: results.predictions.filter((p) => p.prediction === 0)
            .length,
          churnPercentage: (
            (results.predictions.filter((p) => p.prediction === 1).length /
              results.predictions.length) *
            100
          ).toFixed(1),
          highRiskCount: results.predictions.filter(
            (p) => p.churnProbability > 0.7
          ).length,
          mediumRiskCount: results.predictions.filter(
            (p) => p.churnProbability > 0.3 && p.churnProbability <= 0.7
          ).length,
          lowRiskCount: results.predictions.filter(
            (p) => p.churnProbability <= 0.3
          ).length,
          customerHealthScore: (
            (results.predictions.filter((p) => p.churnProbability <= 0.3)
              .length /
              results.predictions.length) *
            100
          ).toFixed(1),
          actionPriorityScore: Math.min(
            100,
            Math.round(
              (results.predictions.filter((p) => p.churnProbability > 0.7)
                .length /
                results.predictions.length) *
                100
            )
          ),
        },
        date: new Date().toISOString(),
        status: "completed",
        savedBy: user.email,
        saveTimestamp: new Date().toISOString(),
      };

      // Save main batch document
      const batchPredictionsRef = collection(
        db,
        "Users",
        user.uid,
        "batchPredictions"
      );
      const mainDocRef = await addDoc(batchPredictionsRef, mainBatchDoc);

      // Split predictions into chunks of 100
      const chunkSize = 100;
      const chunks = [];
      for (let i = 0; i < results.predictions.length; i += chunkSize) {
        chunks.push(results.predictions.slice(i, i + chunkSize));
      }

      // Save chunks using batched writes
      for (let i = 0; i < chunks.length; i++) {
        const batch = writeBatch(db);
        const chunkRef = doc(
          collection(
            db,
            "Users",
            user.uid,
            "batchPredictions",
            mainDocRef.id,
            "chunks"
          )
        );

        batch.set(chunkRef, {
          chunkIndex: i,
          predictions: chunks[i].map((pred) => ({
            customerID: pred.customerID || "",
            prediction: pred.prediction || 0,
            churnProbability: pred.churnProbability || 0,
            prediction_label: pred.prediction_label || "",
            risk_factors: Array.isArray(pred.risk_factors)
              ? pred.risk_factors
              : [],
            confidence_score: pred.confidence_score || 0,
            // Only save essential form data to reduce size
            formData: {
              CustomerID: pred.formData?.CustomerID,
              Tenure: pred.formData?.Tenure,
              OrderCount: pred.formData?.OrderCount,
              SatisfactionScore: pred.formData?.SatisfactionScore,
            },
          })),
        });

        await batch.commit();
      }

      clearTimeout(timeout);
      setSaveTimeout(null);
      setIsSaved(true);
      setIsSaving(false);
      toast.success("Batch predictions saved successfully!");
    } catch (error) {
      console.error("Error saving batch predictions:", error);
      clearTimeout(timeout);
      setSaveTimeout(null);
      setIsSaving(false);
      toast.error(error.message || "Failed to save batch predictions");
    }
  };

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeout) {
        clearTimeout(saveTimeout);
      }
    };
  }, [saveTimeout]);

  // Add this to your existing buttons section
  const renderSaveButton = () => {
    if (isSaved) return null;

    return (
      <button
        onClick={handleSaveBatchResults}
        disabled={isSaving}
        className={`inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-full shadow-sm text-white ${
          isSaving
            ? "bg-gray-400 cursor-not-allowed"
            : "bg-[#1d5a7b] hover:bg-[#164e68]"
        } focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#1d5a7b]`}
      >
        {isSaving ? (
          <>
            <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white mr-2"></div>
            Saving...
          </>
        ) : (
          <>
            <svg
              className="w-4 h-4 mr-2"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"
              />
            </svg>
            Save Batch Results
          </>
        )}
      </button>
    );
  };

  // Render functions
  const renderHighRiskList = () => (
    <div className="mb-4 overflow-auto max-h-60 bg-white rounded border border-red-200 p-2">
      <table className="min-w-full divide-y divide-red-200">
        <thead className="bg-red-50">
          <tr>
            <th className="px-3 py-2 text-left text-xs font-medium text-red-800">
              Customer ID
            </th>
            <th className="px-3 py-2 text-left text-xs font-medium text-red-800">
              Churn Probability
            </th>
            <th className="px-3 py-2 text-left text-xs font-medium text-red-800">
              Priority
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-red-200">
          {highRiskCustomers.map((customer, index) => (
            <tr key={customer.customerID}>
              <td className="px-3 py-2 text-sm text-gray-900">
                {customer.customerID}
              </td>
              <td className="px-3 py-2 text-sm text-gray-900">
                {(customer.churnProbability * 100).toFixed(1)}%
              </td>
              <td className="px-3 py-2 text-sm text-gray-900">
                {index < 100 ? "Urgent" : "High"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const renderMediumRiskList = () => (
    <div className="mb-4 overflow-auto max-h-60 bg-white rounded border border-yellow-200 p-2">
      <table className="min-w-full divide-y divide-yellow-200">
        <thead className="bg-yellow-50">
          <tr>
            <th className="px-3 py-2 text-left text-xs font-medium text-yellow-800">
              Customer ID
            </th>
            <th className="px-3 py-2 text-left text-xs font-medium text-yellow-800">
              Churn Probability
            </th>
            <th className="px-3 py-2 text-left text-xs font-medium text-yellow-800">
              Status
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-yellow-200">
          {mediumRiskCustomers.map((customer) => (
            <tr key={customer.customerID}>
              <td className="px-3 py-2 text-sm text-gray-900">
                {customer.customerID}
              </td>
              <td className="px-3 py-2 text-sm text-gray-900">
                {(customer.churnProbability * 100).toFixed(1)}%
              </td>
              <td className="px-3 py-2 text-sm text-gray-900">
                {customer.churnProbability > 0.5 ? "Priority" : "Monitor"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const renderLowRiskList = () => (
    <div className="mb-4 overflow-auto max-h-60 bg-white rounded border border-green-200 p-2">
      <table className="min-w-full divide-y divide-green-200">
        <thead className="bg-green-50">
          <tr>
            <th className="px-3 py-2 text-left text-xs font-medium text-green-800">
              Customer ID
            </th>
            <th className="px-3 py-2 text-left text-xs font-medium text-green-800">
              Stay Probability
            </th>
            <th className="px-3 py-2 text-left text-xs font-medium text-green-800">
              Status
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-green-200">
          {lowRiskCustomers.map((customer) => (
            <tr key={customer.customerID}>
              <td className="px-3 py-2 text-sm text-gray-900">
                {customer.customerID}
              </td>
              <td className="px-3 py-2 text-sm text-gray-900">
                {((1 - customer.churnProbability) * 100).toFixed(1)}%
              </td>
              <td className="px-3 py-2 text-sm text-gray-900">
                {1 - customer.churnProbability > 0.8 ? "VIP" : "Loyal"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const renderSummary = () => (
    <div className="space-y-6">
      {/* Company Overview Section */}
      <div className="bg-gradient-to-r from-[#1d5a7b] to-[#2d7ba4] text-white p-6 rounded-lg shadow-md">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-bold flex items-center">
            <svg
              className="w-6 h-6 mr-2"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
              />
            </svg>
            Company Overview
          </h3>
          <span className="text-sm bg-white/20 px-3 py-1 rounded-full">
            Last Updated: {new Date().toLocaleDateString()}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
          <div className="bg-white/10 rounded-lg p-4 backdrop-blur-sm">
            <h4 className="text-white/80 text-sm mb-1">Customer Base</h4>
            <p className="text-2xl font-bold">
              {totalRecords.toLocaleString()}
            </p>
            <div className="flex items-center mt-2 text-sm">
              <span
                className={`px-2 py-0.5 rounded-full ${
                  stayCount > churnCount
                    ? "bg-green-500/20 text-green-100"
                    : "bg-red-500/20 text-red-100"
                }`}
              >
                {((stayCount / totalRecords) * 100).toFixed(1)}% Retention Rate
              </span>
            </div>
          </div>

          <div className="bg-white/10 rounded-lg p-4 backdrop-blur-sm">
            <h4 className="text-white/80 text-sm mb-1">Risk Profile</h4>
            <p className="text-2xl font-bold">
              {((highRiskCustomers.length / totalRecords) * 100).toFixed(1)}%
            </p>
            <div className="flex items-center mt-2 text-sm">
              <span className="px-2 py-0.5 rounded-full bg-yellow-500/20 text-yellow-100">
                High Risk Customers
              </span>
            </div>
          </div>

          <div className="bg-white/10 rounded-lg p-4 backdrop-blur-sm">
            <h4 className="text-white/80 text-sm mb-1">Potential Impact</h4>
            <p className="text-2xl font-bold">
              {Math.round(churnCount * 0.6).toLocaleString()}
            </p>
            <div className="flex items-center mt-2 text-sm">
              <span className="px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-100">
                Recoverable Customers
              </span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white/10 rounded-lg p-4 backdrop-blur-sm">
            <h4 className="text-white/80 text-sm mb-3">
              Customer Segment Distribution
            </h4>
            <div className="space-y-2">
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span>High Value Customers</span>
                  <span>
                    {((lowRiskCustomers.length / totalRecords) * 100).toFixed(
                      1
                    )}
                    %
                  </span>
                </div>
                <div className="w-full bg-white/10 rounded-full h-2">
                  <div
                    className="bg-green-400 h-2 rounded-full"
                    style={{
                      width: `${(lowRiskCustomers.length / totalRecords) * 100}%`,
                    }}
                  ></div>
                </div>
              </div>
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span>At-Risk Customers</span>
                  <span>
                    {(
                      (mediumRiskCustomers.length / totalRecords) *
                      100
                    ).toFixed(1)}
                    %
                  </span>
                </div>
                <div className="w-full bg-white/10 rounded-full h-2">
                  <div
                    className="bg-yellow-400 h-2 rounded-full"
                    style={{
                      width: `${(mediumRiskCustomers.length / totalRecords) * 100}%`,
                    }}
                  ></div>
                </div>
              </div>
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span>Critical Attention Needed</span>
                  <span>
                    {((highRiskCustomers.length / totalRecords) * 100).toFixed(
                      1
                    )}
                    %
                  </span>
                </div>
                <div className="w-full bg-white/10 rounded-full h-2">
                  <div
                    className="bg-red-400 h-2 rounded-full"
                    style={{
                      width: `${(highRiskCustomers.length / totalRecords) * 100}%`,
                    }}
                  ></div>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white/10 rounded-lg p-4 backdrop-blur-sm">
            <h4 className="text-white/80 text-sm mb-3">
              Key Performance Indicators
            </h4>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-white/80">Customer Health Score</p>
                  <p className="text-lg font-semibold">
                    {customerHealthScore}%
                  </p>
                </div>
                <svg
                  className="w-8 h-8 text-green-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                  />
                </svg>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-white/80">Retention Rate Target</p>
                  <p className="text-lg font-semibold">
                    {retentionRateTarget}%
                  </p>
                </div>
                <svg
                  className="w-8 h-8 text-blue-400"
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
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-white/80">Action Priority Score</p>
                  <p className="text-lg font-semibold">
                    {actionPriorityScore}%
                  </p>
                </div>
                <svg
                  className="w-8 h-8 text-yellow-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-6 rounded-lg shadow-md border border-gray-200">
          <h3 className="text-lg font-semibold text-gray-700 mb-2">
            Total Customers
          </h3>
          <p className="text-3xl font-bold text-[#1d5a7b]">{totalRecords}</p>
          <p className="text-sm text-gray-500 mt-1">
            Processed from {fileName}
          </p>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-md border border-gray-200">
          <h3 className="text-lg font-semibold text-gray-700 mb-2">
            Likely to Churn
          </h3>
          <p className="text-3xl font-bold text-red-500">{churnCount}</p>
          <p className="text-sm text-gray-500 mt-1">
            {churnPercentage}% of customers
          </p>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-md border border-gray-200">
          <h3 className="text-lg font-semibold text-gray-700 mb-2">
            Likely to Stay
          </h3>
          <p className="text-3xl font-bold text-green-500">{stayCount}</p>
          <p className="text-sm text-gray-500 mt-1">
            {(100 - parseFloat(churnPercentage)).toFixed(1)}% of customers
          </p>
        </div>
      </div>
      <div className="bg-white p-6 rounded-lg shadow-md border border-gray-200">
        <h3 className="text-lg font-semibold text-gray-700 mb-4">
          Risk Distribution
        </h3>
        <div className="flex items-center mb-4">
          <div className="w-full bg-gray-200 rounded-full h-4">
            <div className="flex h-4 rounded-full overflow-hidden">
              <div
                className="bg-red-500"
                style={{
                  width: `${(highRiskCustomers.length / totalRecords) * 100}%`,
                }}
              ></div>
              <div
                className="bg-yellow-500"
                style={{
                  width: `${(mediumRiskCustomers.length / totalRecords) * 100}%`,
                }}
              ></div>
              <div
                className="bg-green-500"
                style={{
                  width: `${(lowRiskCustomers.length / totalRecords) * 100}%`,
                }}
              ></div>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-sm font-medium text-gray-500">High Risk</p>
            <p className="text-lg font-bold text-red-500">
              {highRiskCustomers.length}
            </p>
            <p className="text-xs text-gray-400">
              {((highRiskCustomers.length / totalRecords) * 100).toFixed(1)}%
            </p>
          </div>
          <div>
            <p className="text-sm font-medium text-gray-500">Medium Risk</p>
            <p className="text-lg font-bold text-yellow-500">
              {mediumRiskCustomers.length}
            </p>
            <p className="text-xs text-gray-400">
              {((mediumRiskCustomers.length / totalRecords) * 100).toFixed(1)}%
            </p>
          </div>
          <div>
            <p className="text-sm font-medium text-gray-500">Low Risk</p>
            <p className="text-lg font-bold text-green-500">
              {lowRiskCustomers.length}
            </p>
            <p className="text-xs text-gray-400">
              {((lowRiskCustomers.length / totalRecords) * 100).toFixed(1)}%
            </p>
          </div>
        </div>
      </div>
      {/* Detailed Action Plan */}
      <div className="bg-white p-6 rounded-lg shadow-md border border-gray-200">
        <h3 className="text-lg font-semibold text-gray-700 mb-4 flex items-center">
          <svg
            className="w-5 h-5 mr-2 text-blue-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
            />
          </svg>
          Detailed Action Plan
        </h3>

        <div className="space-y-6">
          {/* Immediate Actions */}
          <div className="relative">
            <div className="absolute left-0 top-0 bottom-0 w-1 bg-red-500 rounded"></div>
            <div className="pl-6">
              <h4 className="text-lg font-semibold text-gray-800 mb-3 flex items-center">
                <span className="w-8 h-8 rounded-full bg-red-100 text-red-600 mr-2 flex items-center justify-center text-sm">
                  24h
                </span>
                Immediate Actions (24-48 hours)
              </h4>
              <div className="bg-red-50 rounded-lg p-4 mb-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center">
                    <span className="px-2 py-1 bg-red-200 text-red-800 rounded text-sm font-medium">
                      High Risk - {highRiskCustomers.length} Customers
                    </span>
                    <span className="ml-2 text-sm text-red-600">
                      Requires immediate intervention
                    </span>
                  </div>
                  <button
                    onClick={() => setShowHighRiskList(!showHighRiskList)}
                    className="flex items-center px-2 py-1 text-sm text-red-600 hover:text-red-800 transition-colors"
                  >
                    {showHighRiskList ? (
                      <FaChevronUp className="mr-1" />
                    ) : (
                      <FaChevronDown className="mr-1" />
                    )}
                    {showHighRiskList ? "Hide List" : "Show List"}
                  </button>
                </div>
                {showHighRiskList && renderHighRiskList()}
                <ul className="space-y-3 text-sm">
                  <li className="flex items-start">
                    <svg
                      className="w-5 h-5 text-red-500 mr-2 mt-0.5"
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
                    <div>
                      <span className="font-medium">
                        Contact {highRiskCustomers.length} high-risk customers:
                      </span>
                      <ul className="ml-6 mt-1 list-disc text-gray-600">
                        <li>
                          Prepare personalized retention offers based on
                          customer history
                        </li>
                        <li>
                          Priority outreach to top{" "}
                          {Math.min(100, highRiskCustomers.length)} customers by
                          churn probability
                        </li>
                        <li>Document all customer feedback for analysis</li>
                      </ul>
                    </div>
                  </li>
                  <li className="flex items-start">
                    <svg
                      className="w-5 h-5 text-red-500 mr-2 mt-0.5"
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
                    <div>
                      <span className="font-medium">
                        Review customer complaints:
                      </span>
                      <ul className="ml-6 mt-1 list-disc text-gray-600">
                        <li>Address all pending issues within 24 hours</li>
                        <li>Prepare compensation packages if necessary</li>
                        <li>
                          Set up rapid response team for high-priority cases
                        </li>
                      </ul>
                    </div>
                  </li>
                </ul>
              </div>
            </div>
          </div>

          {/* Short-term Actions */}
          <div className="relative">
            <div className="absolute left-0 top-0 bottom-0 w-1 bg-yellow-500 rounded"></div>
            <div className="pl-6">
              <h4 className="text-lg font-semibold text-gray-800 mb-3 flex items-center">
                <span className="w-8 h-8 rounded-full bg-yellow-100 text-yellow-600 mr-2 flex items-center justify-center text-sm">
                  1w
                </span>
                Short-term Actions (1-2 weeks)
              </h4>
              <div className="bg-yellow-50 rounded-lg p-4 mb-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center">
                    <span className="px-2 py-1 bg-yellow-200 text-yellow-800 rounded text-sm font-medium">
                      Medium Risk - {mediumRiskCustomers.length} Customers
                    </span>
                    <span className="ml-2 text-sm text-yellow-600">
                      Monitor and engage
                    </span>
                  </div>
                  <button
                    onClick={() => setShowMediumRiskList(!showMediumRiskList)}
                    className="flex items-center px-2 py-1 text-sm text-yellow-600 hover:text-yellow-800 transition-colors"
                  >
                    {showMediumRiskList ? (
                      <FaChevronUp className="mr-1" />
                    ) : (
                      <FaChevronDown className="mr-1" />
                    )}
                    {showMediumRiskList ? "Hide List" : "Show List"}
                  </button>
                </div>
                {showMediumRiskList && renderMediumRiskList()}
                <ul className="space-y-3 text-sm">
                  <li className="flex items-start">
                    <svg
                      className="w-5 h-5 text-yellow-500 mr-2 mt-0.5"
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
                    <div>
                      <span className="font-medium">
                        Engagement campaign for {mediumRiskCustomers.length}{" "}
                        at-risk customers:
                      </span>
                      <ul className="ml-6 mt-1 list-disc text-gray-600">
                        <li>Send personalized satisfaction surveys</li>
                        <li>Offer product education and support sessions</li>
                        <li>Develop targeted promotional campaigns</li>
                      </ul>
                    </div>
                  </li>
                </ul>
              </div>
            </div>
          </div>

          {/* Long-term Strategy */}
          <div className="relative">
            <div className="absolute left-0 top-0 bottom-0 w-1 bg-green-500 rounded"></div>
            <div className="pl-6">
              <h4 className="text-lg font-semibold text-gray-800 mb-3 flex items-center">
                <span className="w-8 h-8 rounded-full bg-green-100 text-green-600 mr-2 flex items-center justify-center text-sm">
                  1m
                </span>
                Long-term Strategy (1-3 months)
              </h4>
              <div className="bg-green-50 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center">
                    <span className="px-2 py-1 bg-green-200 text-green-800 rounded text-sm font-medium">
                      Low Risk - {lowRiskCustomers.length} Customers
                    </span>
                    <span className="ml-2 text-sm text-green-600">
                      Maintain satisfaction
                    </span>
                  </div>
                  <button
                    onClick={() => setShowLowRiskList(!showLowRiskList)}
                    className="flex items-center px-2 py-1 text-sm text-green-600 hover:text-green-800 transition-colors"
                  >
                    {showLowRiskList ? (
                      <FaChevronUp className="mr-1" />
                    ) : (
                      <FaChevronDown className="mr-1" />
                    )}
                    {showLowRiskList ? "Hide List" : "Show List"}
                  </button>
                </div>
                {showLowRiskList && renderLowRiskList()}
                <ul className="space-y-3 text-sm">
                  <li className="flex items-start">
                    <svg
                      className="w-5 h-5 text-green-500 mr-2 mt-0.5"
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
                    <div>
                      <span className="font-medium">
                        Loyalty program enhancements:
                      </span>
                      <ul className="ml-6 mt-1 list-disc text-gray-600">
                        <li>Implement tiered rewards system</li>
                        <li>Create exclusive member benefits</li>
                        <li>Develop referral incentives</li>
                      </ul>
                    </div>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
      {/* Enhanced Business Impact Analysis Section */}
      <div className="bg-white p-6 rounded-lg shadow-md border border-gray-200">
        <h3 className="text-lg font-semibold text-gray-700 mb-4 flex items-center">
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
              d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          Business Impact Analysis
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-yellow-50 rounded-lg p-4">
            <h4 className="font-semibold text-yellow-800 mb-2">
              Revenue at Risk
            </h4>
            <div className="space-y-2">
              <p className="text-sm text-yellow-600">
                <span className="font-bold text-lg block">
                  {churnCount} Customers
                </span>
                At risk of churning
              </p>
              <p className="text-sm text-yellow-600">
                <span className="font-bold text-lg block">
                  {Math.round(churnCount * 0.6)}
                </span>
                Potentially recoverable
              </p>
            </div>
          </div>

          <div className="bg-emerald-50 rounded-lg p-4">
            <h4 className="font-semibold text-emerald-800 mb-2">
              Retention Priority
            </h4>
            <div className="space-y-2">
              <p className="text-sm text-emerald-600">
                <span className="font-bold text-lg block">
                  {mediumRiskCustomers.length} Customers
                </span>
                Medium risk - Highest ROI opportunity
              </p>
              <p className="text-sm text-emerald-600">
                <span className="font-bold text-lg block">
                  {((mediumRiskCustomers.length / totalRecords) * 100).toFixed(
                    1
                  )}
                  %
                </span>
                Of total customer base
              </p>
            </div>
          </div>

          <div className="bg-blue-50 rounded-lg p-4">
            <h4 className="font-semibold text-blue-800 mb-2">
              Loyalty Potential
            </h4>
            <div className="space-y-2">
              <p className="text-sm text-blue-600">
                <span className="font-bold text-lg block">
                  {lowRiskCustomers.length} Customers
                </span>
                Loyal customers for referrals
              </p>
              <p className="text-sm text-blue-600">
                <span className="font-bold text-lg block">
                  {((lowRiskCustomers.length / totalRecords) * 100).toFixed(1)}%
                </span>
                Potential brand ambassadors
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-gray-50 rounded-lg p-4">
            <h4 className="font-semibold text-gray-800 mb-3">
              Strategic Recommendations
            </h4>
            <ul className="space-y-2 text-sm text-gray-600">
              <li className="flex items-start">
                <svg
                  className="w-5 h-5 text-green-500 mr-2 mt-0.5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                Implement personalized retention offers for high-risk segment
              </li>
              <li className="flex items-start">
                <svg
                  className="w-5 h-5 text-green-500 mr-2 mt-0.5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                Launch targeted loyalty program for medium-risk customers
              </li>
              <li className="flex items-start">
                <svg
                  className="w-5 h-5 text-green-500 mr-2 mt-0.5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                Develop referral program leveraging loyal customer base
              </li>
            </ul>
          </div>

          <div className="bg-gray-50 rounded-lg p-4">
            <h4 className="font-semibold text-gray-800 mb-3">
              Expected Outcomes
            </h4>
            <ul className="space-y-2 text-sm text-gray-600">
              <li className="flex items-start">
                <svg
                  className="w-5 h-5 text-blue-500 mr-2 mt-0.5"
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
                Potential to recover {Math.round(churnCount * 0.6)} customers
                through immediate action
              </li>
              <li className="flex items-start">
                <svg
                  className="w-5 h-5 text-blue-500 mr-2 mt-0.5"
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
                Improve retention rate by up to{" "}
                {((mediumRiskCustomers.length / totalRecords) * 100).toFixed(1)}
                % through medium-risk engagement
              </li>
              <li className="flex items-start">
                <svg
                  className="w-5 h-5 text-blue-500 mr-2 mt-0.5"
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
                Generate new leads through{" "}
                {Math.round(lowRiskCustomers.length * 0.2)} potential referrals
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );

  const renderTable = () => (
    <div className="bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Customer ID
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Prediction
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Churn Probability
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Risk Level
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {currentData.map((prediction, index) => {
              // Skip invalid predictions
              if (
                !prediction ||
                typeof prediction.churnProbability === "undefined"
              ) {
                return null;
              }

              const riskLevel =
                prediction.churnProbability > 0.7
                  ? "High"
                  : prediction.churnProbability > 0.3
                    ? "Medium"
                    : "Low";

              const riskColorClass =
                riskLevel === "High"
                  ? "text-red-500"
                  : riskLevel === "Medium"
                    ? "text-yellow-600"
                    : "text-green-500";

              return (
                <tr
                  key={prediction.customerID || index}
                  className="hover:bg-gray-50"
                >
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {prediction.customerID || `Customer ${index + 1}`}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        prediction.prediction === 1
                          ? "bg-red-100 text-red-800"
                          : "bg-green-100 text-green-800"
                      }`}
                    >
                      {prediction.prediction === 1 ? "Will Churn" : "Will Stay"}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {(prediction.churnProbability * 100).toFixed(1)}%
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <span className={`font-medium ${riskColorClass}`}>
                      {riskLevel}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <div className="flex items-center text-green-600">
                      <FaCheckCircle className="mr-1.5 h-4 w-4" />
                      <span className="text-xs">Processed</span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {(!currentData || currentData.length === 0) && (
        <div className="p-4 text-center text-gray-500">
          No prediction results available
        </div>
      )}
    </div>
  );

  const riskDistributionData = {
    labels: ["High Risk", "Medium Risk", "Low Risk"],
    datasets: [
      {
        data: [
          highRiskCustomers.length,
          mediumRiskCustomers.length,
          lowRiskCustomers.length,
        ],
        backgroundColor: ["#ef4444", "#eab308", "#22c55e"],
        borderColor: ["#fff", "#fff", "#fff"],
        borderWidth: 2,
      },
    ],
  };

  const churnPredictionData = {
    labels: ["Will Churn", "Will Stay"],
    datasets: [
      {
        data: [churnCount, stayCount],
        backgroundColor: ["#ef4444", "#22c55e"],
        borderColor: ["#fff", "#fff"],
        borderWidth: 2,
      },
    ],
  };

  // Data for probability distribution bar chart
  const probabilityRanges = Array.from({ length: 10 }, (_, i) => i * 0.1);
  const probabilityDistribution = probabilityRanges.map((range) => {
    return predictions.filter(
      (p) => p.churnProbability >= range && p.churnProbability < range + 0.1
    ).length;
  });

  const probabilityDistributionData = {
    labels: probabilityRanges.map(
      (range) =>
        `${(range * 100).toFixed(0)}-${((range + 0.1) * 100).toFixed(0)}%`
    ),
    datasets: [
      {
        label: "Number of Customers",
        data: probabilityDistribution,
        backgroundColor: "#1d5a7b",
        borderColor: "#164e68",
        borderWidth: 1,
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: "bottom",
      },
    },
  };

  const barChartOptions = {
    ...chartOptions,
    scales: {
      y: {
        beginAtZero: true,
        title: {
          display: true,
          text: "Number of Customers",
        },
      },
      x: {
        title: {
          display: true,
          text: "Churn Probability Range",
        },
      },
    },
  };

  const renderCharts = () => (
    <div className="space-y-6">
      {/* Risk Level Distribution */}
      <div className="bg-white p-6 rounded-lg shadow-md border border-gray-200">
        <h3 className="text-lg font-semibold text-gray-700 mb-4">
          Risk Level Distribution
        </h3>
        <div className="h-80">
          <Pie data={riskDistributionData} options={chartOptions} />
        </div>
      </div>

      {/* Churn Prediction Distribution */}
      <div className="bg-white p-6 rounded-lg shadow-md border border-gray-200">
        <h3 className="text-lg font-semibold text-gray-700 mb-4">
          Churn Prediction Distribution
        </h3>
        <div className="h-80">
          <Pie data={churnPredictionData} options={chartOptions} />
        </div>
      </div>

      {/* Churn Probability Distribution */}
      <div className="bg-white p-6 rounded-lg shadow-md border border-gray-200">
        <h3 className="text-lg font-semibold text-gray-700 mb-4">
          Churn Probability Distribution
        </h3>
        <div className="h-80">
          <Bar data={probabilityDistributionData} options={barChartOptions} />
        </div>
      </div>

      {/* Risk Factors Analysis */}
      <div className="bg-white p-6 rounded-lg shadow-md border border-gray-200">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-lg font-semibold text-gray-700">
            Top Risk Factors
          </h3>
          <div className="text-sm text-gray-500">
            Based on high-risk customers
          </div>
        </div>

        <div className="space-y-6">
          {Object.entries(
            predictions.reduce((acc, pred) => {
              const riskFactors = [];
              if (pred.churnProbability > 0.5) {
                if (pred.formData?.SatisfactionScore <= 2)
                  riskFactors.push("Low Satisfaction Score");
                if (pred.formData?.Complain === "1")
                  riskFactors.push("Has Active Complaints");
                if (parseInt(pred.formData?.DaySinceLastOrder) > 30)
                  riskFactors.push("Inactive > 30 Days");
                if (parseInt(pred.formData?.OrderCount) <= 2)
                  riskFactors.push("Low Order Count");
                if (parseFloat(pred.formData?.OrderAmountHikeFromlastYear) < 0)
                  riskFactors.push("Declining Order Value");
                if (parseInt(pred.formData?.Tenure) <= 3)
                  riskFactors.push("New Customer (≤3 months)");
                if (parseInt(pred.formData?.CouponUsed) === 0)
                  riskFactors.push("No Coupon Usage");
                if (parseFloat(pred.formData?.HourSpendOnApp) < 1.5)
                  riskFactors.push("Low App Engagement");
              }
              riskFactors.forEach((factor) => {
                acc[factor] = (acc[factor] || 0) + 1;
              });
              return acc;
            }, {})
          )
            .sort(([, a], [, b]) => b - a)
            .slice(0, 6)
            .map(([factor, count], index) => {
              const percentage = (count / highRiskCustomers.length) * 100;
              const colors = [
                "from-red-500 to-red-400",
                "from-orange-500 to-orange-400",
                "from-yellow-500 to-yellow-400",
                "from-amber-500 to-amber-400",
                "from-rose-500 to-rose-400",
                "from-pink-500 to-pink-400",
              ];

              return (
                <div key={factor} className="relative group">
                  <div className="flex justify-between mb-1">
                    <span className="text-sm font-medium text-gray-700 flex items-center">
                      <span
                        className={`inline-block w-2 h-2 rounded-full bg-gradient-to-r ${colors[index]} mr-2`}
                      ></span>
                      {factor}
                    </span>
                    <span className="text-sm text-gray-500">
                      {percentage.toFixed(1)}%
                    </span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
                    <div
                      className={`h-full rounded-full bg-gradient-to-r ${colors[index]} transition-all duration-500 relative`}
                      style={{ width: `${percentage}%` }}
                    >
                      <div className="absolute inset-0 bg-white/20 rounded-full"></div>
                    </div>
                  </div>
                </div>
              );
            })}
        </div>
      </div>

      {/* Customer Tenure Distribution */}
      <div className="bg-white p-6 rounded-lg shadow-md border border-gray-200">
        <h3 className="text-lg font-semibold text-gray-700 mb-4">
          Customer Tenure Distribution
        </h3>
        <div className="space-y-4">
          {Object.entries(
            predictions.reduce((acc, pred) => {
              const tenure = parseInt(pred.formData?.Tenure) || 0;
              const range = Math.floor(tenure / 6) * 6; // Group by 6-month intervals
              const key = `${range}-${range + 5} months`;
              acc[key] = (acc[key] || 0) + 1;
              return acc;
            }, {})
          )
            .sort(([a], [b]) => {
              const aStart = parseInt(a.split("-")[0]);
              const bStart = parseInt(b.split("-")[0]);
              return aStart - bStart;
            })
            .map(([range, count]) => {
              const percentage = (count / totalRecords) * 100;
              return (
                <div key={range} className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">{range}</span>
                    <span className="text-gray-500">{count} customers</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2.5">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-blue-500 to-blue-400"
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>
              );
            })}
        </div>
      </div>

      {/* Satisfaction Score Distribution */}
      <div className="bg-white p-6 rounded-lg shadow-md border border-gray-200">
        <h3 className="text-lg font-semibold text-gray-700 mb-4">
          Satisfaction Score Distribution
        </h3>
        <div className="grid grid-cols-5 gap-4">
          {[1, 2, 3, 4, 5].map((score) => {
            const count = predictions.filter((p) => {
              const satisfactionScore = parseInt(p.formData?.SatisfactionScore);
              return satisfactionScore === score;
            }).length;

            const percentage = (count / totalRecords) * 100;
            const colorClass =
              score <= 2
                ? "from-red-500 to-red-400"
                : score === 3
                  ? "from-yellow-500 to-yellow-400"
                  : "from-green-500 to-green-400";

            return (
              <div key={score} className="text-center">
                <div className="text-2xl font-bold mb-1">{score}</div>
                <div className="h-40 flex items-end justify-center">
                  <div
                    className={`w-12 bg-gradient-to-t ${colorClass} rounded-t-lg transition-all duration-500`}
                    style={{ height: `${Math.max(percentage * 2, 2)}px` }}
                  />
                </div>
                <div className="mt-2 text-sm text-gray-600">
                  {count} customers
                </div>
                <div className="text-xs text-gray-500">
                  {percentage.toFixed(1)}%
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Monthly Churn Trend */}
      <div className="bg-white p-6 rounded-lg shadow-md border border-gray-200">
        <h3 className="text-lg font-semibold text-gray-700 mb-4">
          Monthly Churn Trend
        </h3>
        <div className="h-64 flex items-end space-x-2">
          {Array.from({ length: 12 }, (_, i) => {
            const month = new Date();
            month.setMonth(month.getMonth() - i);
            const monthName = month.toLocaleString("default", {
              month: "short",
            });
            const year = month.getFullYear();

            // Simulate monthly churn data (in a real app, this would come from your data)
            const churnCount = Math.floor(Math.random() * 50) + 10;
            const totalCustomers = Math.floor(Math.random() * 200) + 100;
            const churnRate = (churnCount / totalCustomers) * 100;

            return (
              <div key={`${monthName}-${year}`} className="flex-1">
                <div className="h-48 flex items-end">
                  <div
                    className="w-full bg-gradient-to-t from-red-500 to-red-400 rounded-t-lg transition-all duration-500"
                    style={{ height: `${churnRate * 2}px` }}
                  />
                </div>
                <div className="text-center mt-2">
                  <div className="text-xs text-gray-600">{monthName}</div>
                  <div className="text-xs text-gray-500">{year}</div>
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-4 flex justify-center space-x-4">
          <div className="flex items-center">
            <div className="w-3 h-3 bg-red-500 rounded-full mr-2"></div>
            <span className="text-sm text-gray-600">Churn Rate</span>
          </div>
        </div>
      </div>

      {/* Order Frequency Distribution */}
      <div className="bg-white p-6 rounded-lg shadow-md border border-gray-200">
        <h3 className="text-lg font-semibold text-gray-700 mb-4">
          Order Frequency Distribution
        </h3>
        <div className="space-y-4">
          {(() => {
            const orderGroups = {
              "0-2 orders": 0,
              "3-5 orders": 0,
              "6-10 orders": 0,
              "11-15 orders": 0,
              "16+ orders": 0,
            };

            predictions.forEach((p) => {
              const orderCount = parseInt(p.formData?.OrderCount) || 0;
              if (orderCount <= 2) orderGroups["0-2 orders"]++;
              else if (orderCount <= 5) orderGroups["3-5 orders"]++;
              else if (orderCount <= 10) orderGroups["6-10 orders"]++;
              else if (orderCount <= 15) orderGroups["11-15 orders"]++;
              else orderGroups["16+ orders"]++;
            });

            return Object.entries(orderGroups).map(([range, count]) => {
              const percentage = (count / totalRecords) * 100;
              return (
                <div key={range} className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">{range}</span>
                    <span className="text-gray-500">
                      {count} customers ({percentage.toFixed(1)}%)
                    </span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2.5">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-purple-500 to-purple-400"
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>
              );
            });
          })()}
        </div>
      </div>

      {/* Customer Engagement Metrics */}
      <div className="bg-white p-6 rounded-lg shadow-md border border-gray-200">
        <h3 className="text-lg font-semibold text-gray-700 mb-4">
          Customer Engagement Metrics
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* App Usage Distribution */}
          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-4">
              Daily App Usage
            </h4>
            <div className="space-y-4">
              {(() => {
                const usageGroups = {
                  "< 1 hour": 0,
                  "1-2 hours": 0,
                  "2-3 hours": 0,
                  "3-4 hours": 0,
                  "4+ hours": 0,
                };

                predictions.forEach((p) => {
                  const hours = parseFloat(p.formData?.HourSpendOnApp) || 0;
                  if (hours < 1) usageGroups["< 1 hour"]++;
                  else if (hours < 2) usageGroups["1-2 hours"]++;
                  else if (hours < 3) usageGroups["2-3 hours"]++;
                  else if (hours < 4) usageGroups["3-4 hours"]++;
                  else usageGroups["4+ hours"]++;
                });

                return Object.entries(usageGroups).map(([range, count]) => {
                  const percentage = (count / totalRecords) * 100;
                  return (
                    <div key={range} className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">{range}</span>
                        <span className="text-gray-500">
                          {percentage.toFixed(1)}%
                        </span>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-2">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-indigo-400"
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          </div>

          {/* Device Registration */}
          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-4">
              Registered Devices
            </h4>
            <div className="space-y-4">
              {(() => {
                const deviceCounts = {};
                predictions.forEach((p) => {
                  const devices =
                    parseInt(p.formData?.NumberOfDeviceRegistered) || 0;
                  deviceCounts[devices] = (deviceCounts[devices] || 0) + 1;
                });

                return Object.entries(deviceCounts)
                  .sort(([a], [b]) => parseInt(a) - parseInt(b))
                  .map(([devices, count]) => {
                    const percentage = (count / totalRecords) * 100;
                    return (
                      <div key={devices} className="space-y-1">
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-600">
                            {devices}{" "}
                            {parseInt(devices) === 1 ? "device" : "devices"}
                          </span>
                          <span className="text-gray-500">
                            {percentage.toFixed(1)}%
                          </span>
                        </div>
                        <div className="w-full bg-gray-100 rounded-full h-2">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-blue-500 to-blue-400"
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                      </div>
                    );
                  });
              })()}
            </div>
          </div>
        </div>
      </div>

      {/* Payment Method Distribution */}
      <div className="bg-white p-6 rounded-lg shadow-md border border-gray-200">
        <h3 className="text-lg font-semibold text-gray-700 mb-4">
          Payment Method Distribution
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {(() => {
            const paymentMethods = {};
            predictions.forEach((p) => {
              const method = p.formData?.PreferredPaymentMode || "Other";
              paymentMethods[method] = (paymentMethods[method] || 0) + 1;
            });

            const colors = [
              "from-emerald-500 to-emerald-400",
              "from-blue-500 to-blue-400",
              "from-purple-500 to-purple-400",
              "from-pink-500 to-pink-400",
              "from-yellow-500 to-yellow-400",
            ];

            return Object.entries(paymentMethods).map(
              ([method, count], index) => {
                const percentage = (count / totalRecords) * 100;
                return (
                  <div
                    key={method}
                    className="text-center p-4 bg-gray-50 rounded-lg"
                  >
                    <div className="h-24 flex items-end justify-center mb-2">
                      <div
                        className={`w-16 bg-gradient-to-t ${colors[index % colors.length]} rounded-t-lg transition-all duration-500`}
                        style={{ height: `${Math.max(percentage * 1.5, 10)}%` }}
                      />
                    </div>
                    <div className="text-sm font-medium text-gray-700">
                      {method}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      {percentage.toFixed(1)}%
                    </div>
                    <div className="text-xs text-gray-400">
                      {count} customers
                    </div>
                  </div>
                );
              }
            );
          })()}
        </div>
      </div>

      {/* Device Usage Analysis */}
      <div className="bg-white p-6 rounded-lg shadow-md border border-gray-200">
        <h3 className="text-lg font-semibold text-gray-700 mb-4">
          Device Usage Analysis
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {(() => {
            const deviceUsage = {};
            predictions.forEach((p) => {
              const device = p.formData?.PreferredLoginDevice || "Other";
              deviceUsage[device] = (deviceUsage[device] || 0) + 1;
            });

            const colors = {
              "Mobile Phone": "from-sky-500 to-sky-400",
              Computer: "from-emerald-500 to-emerald-400",
              Tablet: "from-violet-500 to-violet-400",
              Other: "from-gray-500 to-gray-400",
            };

            return Object.entries(deviceUsage).map(([device, count]) => {
              const percentage = (count / totalRecords) * 100;
              return (
                <div key={device} className="bg-gray-50 rounded-lg p-4">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-medium text-gray-700">
                      {device}
                    </span>
                    <span className="text-sm text-gray-500">
                      {percentage.toFixed(1)}%
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-3 mb-2">
                    <div
                      className={`h-full rounded-full bg-gradient-to-r ${colors[device] || colors["Other"]}`}
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                  <div className="text-xs text-gray-500">{count} users</div>
                </div>
              );
            });
          })()}
        </div>
      </div>

      {/* Customer Activity Trends (Line Graph) */}
      <div className="bg-white p-6 rounded-lg shadow-md border border-gray-200">
        <h3 className="text-lg font-semibold text-gray-700 mb-4">
          Customer Activity Trends
        </h3>
        <div className="h-80 relative">
          {(() => {
            // Group customers by tenure and calculate average metrics
            const tenureGroups = {};
            predictions.forEach((p) => {
              const tenure = parseInt(p.formData?.Tenure) || 0;
              if (!tenureGroups[tenure]) {
                tenureGroups[tenure] = {
                  count: 0,
                  totalOrders: 0,
                  totalSpending: 0,
                  totalAppHours: 0,
                };
              }
              tenureGroups[tenure].count++;
              tenureGroups[tenure].totalOrders +=
                parseInt(p.formData?.OrderCount) || 0;
              tenureGroups[tenure].totalSpending +=
                parseFloat(p.formData?.OrderAmountHikeFromlastYear) || 0;
              tenureGroups[tenure].totalAppHours +=
                parseFloat(p.formData?.HourSpendOnApp) || 0;
            });

            // Convert to arrays for plotting
            const tenures = Object.keys(tenureGroups).sort(
              (a, b) => parseInt(a) - parseInt(b)
            );
            const maxTenure = Math.max(...tenures.map((t) => parseInt(t)));
            const avgOrders = tenures.map(
              (t) => tenureGroups[t].totalOrders / tenureGroups[t].count
            );
            const avgSpending = tenures.map(
              (t) => tenureGroups[t].totalSpending / tenureGroups[t].count
            );
            const avgAppHours = tenures.map(
              (t) => tenureGroups[t].totalAppHours / tenureGroups[t].count
            );

            // Calculate max values for scaling
            const maxOrders = Math.max(...avgOrders);
            const maxSpending = Math.max(...avgSpending);
            const maxAppHours = Math.max(...avgAppHours);

            return (
              <>
                {/* Grid lines */}
                <div className="absolute inset-0 grid grid-cols-12 gap-0">
                  {Array.from({ length: 13 }).map((_, i) => (
                    <div key={i} className="border-l border-gray-100 h-full" />
                  ))}
                </div>
                <div className="absolute inset-0 grid grid-rows-8 gap-0">
                  {Array.from({ length: 9 }).map((_, i) => (
                    <div key={i} className="border-t border-gray-100 w-full" />
                  ))}
                </div>

                {/* Lines */}
                <svg
                  className="w-full h-full"
                  viewBox="0 0 1200 800"
                  preserveAspectRatio="none"
                >
                  {/* Orders Line */}
                  <path
                    d={tenures
                      .map((t, i) => {
                        const x = (parseInt(t) / maxTenure) * 1200;
                        const y = 800 - (avgOrders[i] / maxOrders) * 700;
                        return `${i === 0 ? "M" : "L"} ${x} ${y}`;
                      })
                      .join(" ")}
                    stroke="#EF4444"
                    strokeWidth="2"
                    fill="none"
                  />

                  {/* Spending Line */}
                  <path
                    d={tenures
                      .map((t, i) => {
                        const x = (parseInt(t) / maxTenure) * 1200;
                        const y = 800 - (avgSpending[i] / maxSpending) * 700;
                        return `${i === 0 ? "M" : "L"} ${x} ${y}`;
                      })
                      .join(" ")}
                    stroke="#10B981"
                    strokeWidth="2"
                    fill="none"
                  />

                  {/* App Hours Line */}
                  <path
                    d={tenures
                      .map((t, i) => {
                        const x = (parseInt(t) / maxTenure) * 1200;
                        const y = 800 - (avgAppHours[i] / maxAppHours) * 700;
                        return `${i === 0 ? "M" : "L"} ${x} ${y}`;
                      })
                      .join(" ")}
                    stroke="#6366F1"
                    strokeWidth="2"
                    fill="none"
                  />
                </svg>

                {/* Legend */}
                <div className="absolute bottom-0 right-0 bg-white/80 p-2 rounded-lg flex gap-4">
                  <div className="flex items-center">
                    <div className="w-3 h-3 bg-red-500 rounded-full mr-2" />
                    <span className="text-xs text-gray-600">Orders</span>
                  </div>
                  <div className="flex items-center">
                    <div className="w-3 h-3 bg-green-500 rounded-full mr-2" />
                    <span className="text-xs text-gray-600">Spending</span>
                  </div>
                  <div className="flex items-center">
                    <div className="w-3 h-3 bg-indigo-500 rounded-full mr-2" />
                    <span className="text-xs text-gray-600">App Usage</span>
                  </div>
                </div>
              </>
            );
          })()}
        </div>
      </div>

      {/* Customer Behavior Heatmap */}
      <div className="bg-white p-6 rounded-lg shadow-md border border-gray-200">
        <h3 className="text-lg font-semibold text-gray-700 mb-4">
          Customer Behavior Heatmap
        </h3>
        <div className="overflow-x-auto">
          <div className="min-w-[800px]">
            {(() => {
              // Define metrics and segments
              const metrics = [
                "OrderCount",
                "HourSpendOnApp",
                "CouponUsed",
                "CashbackAmount",
              ];
              const segments = ["Low Risk", "Medium Risk", "High Risk"];

              // Calculate averages for each segment and metric
              const heatmapData = segments.map((segment) => {
                const customers =
                  segment === "High Risk"
                    ? highRiskCustomers
                    : segment === "Medium Risk"
                      ? mediumRiskCustomers
                      : lowRiskCustomers;

                return metrics.map((metric) => {
                  const values = customers.map(
                    (c) => parseFloat(c.formData?.[metric]) || 0
                  );
                  const avg = values.reduce((a, b) => a + b, 0) / values.length;
                  return avg;
                });
              });

              // Find max value for each metric for normalization
              const maxValues = metrics.map((_, i) =>
                Math.max(...heatmapData.map((row) => row[i]))
              );

              return (
                <div className="grid grid-cols-[200px,1fr] gap-4">
                  <div className="space-y-4">
                    {segments.map((segment, i) => (
                      <div key={segment} className="h-16 flex items-center">
                        <span className="text-sm font-medium text-gray-700">
                          {segment}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-4 gap-4">
                    {metrics.map((metric, j) => (
                      <div key={metric} className="space-y-4">
                        <div className="h-8 flex items-center justify-center">
                          <span className="text-sm font-medium text-gray-700">
                            {metric.replace(/([A-Z])/g, " $1").trim()}
                          </span>
                        </div>
                        {segments.map((_, i) => {
                          const value = heatmapData[i][j];
                          const intensity = (value / maxValues[j]) * 100;
                          return (
                            <div
                              key={`${i}-${j}`}
                              className="h-16 rounded-lg flex items-center justify-center"
                              style={{
                                background: `linear-gradient(to right, rgba(99, 102, 241, ${intensity / 100}), rgba(99, 102, 241, ${intensity / 100}))`,
                              }}
                            >
                              <span className="text-sm font-medium text-gray-700">
                                {value.toFixed(1)}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      </div>

      {/* Correlation Scatter Plot */}
      <div className="bg-white p-6 rounded-lg shadow-md border border-gray-200">
        <h3 className="text-lg font-semibold text-gray-700 mb-4">
          Order Value vs. App Engagement
        </h3>
        <div className="h-80 relative">
          {(() => {
            // Extract data points
            const dataPoints = predictions.map((p) => ({
              x: parseFloat(p.formData?.HourSpendOnApp) || 0,
              y: parseFloat(p.formData?.OrderAmountHikeFromlastYear) || 0,
              risk:
                p.churnProbability > 0.7
                  ? "high"
                  : p.churnProbability > 0.3
                    ? "medium"
                    : "low",
            }));

            // Calculate bounds
            const maxX = Math.max(...dataPoints.map((p) => p.x));
            const maxY = Math.max(...dataPoints.map((p) => p.y));

            return (
              <>
                {/* Grid lines */}
                <div className="absolute inset-0 grid grid-cols-10 gap-0">
                  {Array.from({ length: 11 }).map((_, i) => (
                    <div key={i} className="border-l border-gray-100 h-full" />
                  ))}
                </div>
                <div className="absolute inset-0 grid grid-rows-8 gap-0">
                  {Array.from({ length: 9 }).map((_, i) => (
                    <div key={i} className="border-t border-gray-100 w-full" />
                  ))}
                </div>

                {/* Scatter Plot */}
                <svg className="w-full h-full" viewBox="0 0 1000 800">
                  {dataPoints.map((point, i) => (
                    <circle
                      key={i}
                      cx={(point.x / maxX) * 950}
                      cy={800 - (point.y / maxY) * 750}
                      r="4"
                      className={
                        point.risk === "high"
                          ? "fill-red-500 opacity-60"
                          : point.risk === "medium"
                            ? "fill-yellow-500 opacity-60"
                            : "fill-green-500 opacity-60"
                      }
                    />
                  ))}
                </svg>

                {/* Axes Labels */}
                <div className="absolute bottom-0 left-0 w-full text-center text-sm text-gray-600">
                  Hours Spent on App
                </div>
                <div className="absolute left-0 top-1/2 -translate-y-1/2 -rotate-90 text-sm text-gray-600">
                  Order Value Change (%)
                </div>

                {/* Legend */}
                <div className="absolute top-0 right-0 bg-white/80 p-2 rounded-lg">
                  <div className="flex items-center gap-4">
                    <div className="flex items-center">
                      <div className="w-3 h-3 bg-red-500 opacity-60 rounded-full mr-2" />
                      <span className="text-xs text-gray-600">High Risk</span>
                    </div>
                    <div className="flex items-center">
                      <div className="w-3 h-3 bg-yellow-500 opacity-60 rounded-full mr-2" />
                      <span className="text-xs text-gray-600">Medium Risk</span>
                    </div>
                    <div className="flex items-center">
                      <div className="w-3 h-3 bg-green-500 opacity-60 rounded-full mr-2" />
                      <span className="text-xs text-gray-600">Low Risk</span>
                    </div>
                  </div>
                </div>
              </>
            );
          })()}
        </div>
      </div>
    </div>
  );

  const renderPagination = () => (
    <div className="flex justify-center mt-4 space-x-2">
      <button
        onClick={() => handlePageChange(1)}
        disabled={currentPage === 1}
        className="px-3 py-1 rounded bg-gray-200 disabled:opacity-50"
      >
        First
      </button>
      <button
        onClick={() => handlePageChange(currentPage - 1)}
        disabled={currentPage === 1}
        className="px-3 py-1 rounded bg-gray-200 disabled:opacity-50"
      >
        Previous
      </button>
      {paginationControls.map((page) => (
        <button
          key={page}
          onClick={() => handlePageChange(page)}
          className={`px-3 py-1 rounded ${
            currentPage === page ? "bg-[#1d5a7b] text-white" : "bg-gray-200"
          }`}
        >
          {page}
        </button>
      ))}
      <button
        onClick={() => handlePageChange(currentPage + 1)}
        disabled={currentPage === totalPages}
        className="px-3 py-1 rounded bg-gray-200 disabled:opacity-50"
      >
        Next
      </button>
      <button
        onClick={() => handlePageChange(totalPages)}
        disabled={currentPage === totalPages}
        className="px-3 py-1 rounded bg-gray-200 disabled:opacity-50"
      >
        Last
      </button>
    </div>
  );

  return (
    <ErrorBoundary>
      <div className="p-6">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-gray-800">
            Prediction Results
          </h2>
          <div className="flex space-x-2">
            {renderSaveButton()}
            <button
              onClick={handleDownloadCSV}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-full shadow-sm text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
            >
              <FaDownload className="mr-2" /> Download CSV
            </button>
            <button
              onClick={() => navigate("/csv-upload")}
              className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-full shadow-sm text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#1d5a7b]"
            >
              Upload Another File
            </button>
          </div>
        </div>

        {/* View mode tabs */}
        <div className="flex space-x-4 mb-6">
          <button
            onClick={() => setViewMode("summary")}
            className={`px-4 py-2 rounded-full ${
              viewMode === "summary"
                ? "bg-[#1d5a7b] text-white"
                : "bg-gray-200 text-gray-700"
            }`}
          >
            Summary
          </button>
          <button
            onClick={() => setViewMode("table")}
            className={`px-4 py-2 rounded-full ${
              viewMode === "table"
                ? "bg-[#1d5a7b] text-white"
                : "bg-gray-200 text-gray-700"
            }`}
          >
            Table
          </button>
          <button
            onClick={() => setViewMode("charts")}
            className={`px-4 py-2 rounded-full ${
              viewMode === "charts"
                ? "bg-[#1d5a7b] text-white"
                : "bg-gray-200 text-gray-700"
            }`}
          >
            Charts
          </button>
        </div>

        {/* Content based on view mode */}
        {viewMode === "summary" && renderSummary()}
        {viewMode === "table" && (
          <>
            {renderTable()}
            {renderPagination()}
          </>
        )}
        {viewMode === "charts" && renderCharts()}
      </div>
    </ErrorBoundary>
  );
};

export default CsvResults;
