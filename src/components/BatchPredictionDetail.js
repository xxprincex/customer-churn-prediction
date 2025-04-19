import React, { useState, useCallback, useMemo, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { auth, db } from "./firebase";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  orderBy,
} from "firebase/firestore";
import { toast } from "react-toastify";
import {
  FaDownload,
  FaChevronUp,
  FaChevronDown,
  FaCheckCircle,
} from "react-icons/fa";

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
    console.error("Error in BatchPredictionDetail:", error, errorInfo);
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

const BatchPredictionDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [batchData, setBatchData] = useState(null);
  const [chunks, setChunks] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [viewMode, setViewMode] = useState("summary");
  const [showHighRiskList, setShowHighRiskList] = useState(false);
  const [showMediumRiskList, setShowMediumRiskList] = useState(false);
  const [showLowRiskList, setShowLowRiskList] = useState(false);
  const [sortField, setSortField] = useState("churnProbability");
  const [sortDirection, setSortDirection] = useState("desc");

  useEffect(() => {
    const fetchBatchDetails = async () => {
      try {
        const user = auth.currentUser;
        if (!user) {
          navigate("/login");
          return;
        }

        const batchRef = doc(db, "Users", user.uid, "batchPredictions", id);
        const batchDoc = await getDoc(batchRef);

        if (!batchDoc.exists()) {
          toast.error("Batch prediction not found");
          navigate("/account");
          return;
        }

        setBatchData(batchDoc.data());

        const chunksRef = collection(batchRef, "chunks");
        const chunksQuery = query(chunksRef, orderBy("chunkIndex"));
        const chunksSnapshot = await getDocs(chunksQuery);

        const allChunks = [];
        chunksSnapshot.forEach((doc) => {
          allChunks.push(...doc.data().predictions);
        });
        setChunks(allChunks);
      } catch (error) {
        console.error("Error fetching batch details:", error);
        toast.error("Failed to load batch prediction details");
      } finally {
        setLoading(false);
      }
    };

    fetchBatchDetails();
  }, [id, navigate]);

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
    const total = chunks.length;
    const highRisk = chunks.filter((p) => p.churnProbability > 0.7);
    const mediumRisk = chunks.filter(
      (p) => p.churnProbability > 0.3 && p.churnProbability <= 0.7
    );
    const lowRisk = chunks.filter((p) => p.churnProbability <= 0.3);
    const churn = chunks.filter((p) => p.prediction === 1).length;
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
  }, [chunks]);

  // Memoized sorted data
  const sortedData = useMemo(() => {
    const data = [...chunks];
    return data.sort((a, b) => {
      const aValue = a[sortField];
      const bValue = b[sortField];
      return sortDirection === "asc" ? aValue - bValue : bValue - aValue;
    });
  }, [chunks, sortField, sortDirection]);

  // Pagination calculations
  const totalPages = Math.ceil(chunks.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const currentData = sortedData.slice(startIndex, endIndex);

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
      ...chunks.map((p) => {
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
    a.setAttribute("download", `batch_prediction_${id}_results.csv`);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, [chunks, id]);

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

  const renderRiskDistribution = () => {
    const highRisk = chunks.filter((p) => p.churnProbability > 0.7);
    const mediumRisk = chunks.filter(
      (p) => p.churnProbability > 0.3 && p.churnProbability <= 0.7
    );
    const lowRisk = chunks.filter((p) => p.churnProbability <= 0.3);

    return (
      <div className="bg-white p-6 rounded-lg shadow-md border border-gray-200">
        <h3 className="text-lg font-semibold text-gray-700 mb-4">
          Risk Level Distribution
        </h3>
        <div className="h-80 flex items-end justify-around px-10">
          <div className="flex flex-col items-center">
            <div
              className="w-32 bg-red-500 rounded-t-md transition-all duration-500 ease-in-out hover:opacity-80"
              style={{
                height: `${Math.max((highRisk.length / chunks.length) * 300, 2)}px`,
                minHeight: "2px",
              }}
            >
              <div className="text-white text-center py-2">
                {((highRisk.length / chunks.length) * 100).toFixed(1)}%
              </div>
            </div>
            <p className="mt-2 text-sm font-medium">High Risk</p>
            <p className="text-xs text-gray-500">{highRisk.length} customers</p>
          </div>
          <div className="flex flex-col items-center">
            <div
              className="w-32 bg-yellow-500 rounded-t-md transition-all duration-500 ease-in-out hover:opacity-80"
              style={{
                height: `${Math.max((mediumRisk.length / chunks.length) * 300, 2)}px`,
                minHeight: "2px",
              }}
            >
              <div className="text-white text-center py-2">
                {((mediumRisk.length / chunks.length) * 100).toFixed(1)}%
              </div>
            </div>
            <p className="mt-2 text-sm font-medium">Medium Risk</p>
            <p className="text-xs text-gray-500">
              {mediumRisk.length} customers
            </p>
          </div>
          <div className="flex flex-col items-center">
            <div
              className="w-32 bg-green-500 rounded-t-md transition-all duration-500 ease-in-out hover:opacity-80"
              style={{
                height: `${Math.max((lowRisk.length / chunks.length) * 300, 2)}px`,
                minHeight: "2px",
              }}
            >
              <div className="text-white text-center py-2">
                {((lowRisk.length / chunks.length) * 100).toFixed(1)}%
              </div>
            </div>
            <p className="mt-2 text-sm font-medium">Low Risk</p>
            <p className="text-xs text-gray-500">{lowRisk.length} customers</p>
          </div>
        </div>
      </div>
    );
  };

  const renderChurnDistribution = () => {
    const churnCount = chunks.filter((p) => p.prediction === 1).length;
    const stayCount = chunks.length - churnCount;
    const churnPercentage = (churnCount / chunks.length) * 100;

    return (
      <div className="bg-white p-6 rounded-lg shadow-md border border-gray-200">
        <h3 className="text-lg font-semibold text-gray-700 mb-4">
          Churn Prediction Distribution
        </h3>
        <div className="flex justify-center">
          <div className="relative w-64 h-64">
            <svg viewBox="0 0 100 100" className="w-full h-full">
              <path
                d={`M 50 50 L 50 0 A 50 50 0 ${churnPercentage > 50 ? 0 : 1} 1 ${50 + 50 * Math.sin((2 * Math.PI * churnPercentage) / 100)} ${50 - 50 * Math.cos((2 * Math.PI * churnPercentage) / 100)} Z`}
                fill="#10B981"
              />
              <path
                d={`M 50 50 L ${50 + 50 * Math.sin((2 * Math.PI * churnPercentage) / 100)} ${50 - 50 * Math.cos((2 * Math.PI * churnPercentage) / 100)} A 50 50 0 ${churnPercentage > 50 ? 1 : 0} 1 50 0 Z`}
                fill="#EF4444"
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center flex-col">
              <p className="text-3xl font-bold text-gray-800">
                {churnPercentage.toFixed(1)}%
              </p>
              <p className="text-sm text-gray-500">Churn Rate</p>
            </div>
          </div>
        </div>
        <div className="flex justify-center mt-4 space-x-8">
          <div className="flex items-center">
            <div className="w-4 h-4 bg-red-500 rounded-full mr-2"></div>
            <span className="text-sm text-gray-600">
              Likely to Churn ({churnCount})
            </span>
          </div>
          <div className="flex items-center">
            <div className="w-4 h-4 bg-green-500 rounded-full mr-2"></div>
            <span className="text-sm text-gray-600">
              Likely to Stay ({stayCount})
            </span>
          </div>
        </div>
      </div>
    );
  };

  const renderRiskFactorsAnalysis = () => {
    const riskFactors = chunks.reduce((acc, pred) => {
      if (pred.churnProbability > 0.5) {
        const factors = [];
        if (pred.formData?.SatisfactionScore <= 2)
          factors.push("Low Satisfaction Score");
        if (pred.formData?.Complain === "1")
          factors.push("Has Active Complaints");
        if (parseInt(pred.formData?.DaySinceLastOrder) > 30)
          factors.push("Inactive > 30 Days");
        if (parseInt(pred.formData?.OrderCount) <= 2)
          factors.push("Low Order Count");
        if (parseFloat(pred.formData?.OrderAmountHikeFromlastYear) < 0)
          factors.push("Declining Order Value");
        if (parseInt(pred.formData?.Tenure) <= 3)
          factors.push("New Customer (≤3 months)");
        if (parseInt(pred.formData?.CouponUsed) === 0)
          factors.push("No Coupon Usage");
        if (parseFloat(pred.formData?.HourSpendOnApp) < 1.5)
          factors.push("Low App Engagement");

        factors.forEach((factor) => {
          acc[factor] = (acc[factor] || 0) + 1;
        });
      }
      return acc;
    }, {});

    const highRiskCount = chunks.filter((p) => p.churnProbability > 0.7).length;

    return (
      <div className="bg-white p-6 rounded-lg shadow-md border border-gray-200">
        <h3 className="text-lg font-semibold text-gray-700 mb-4">
          Top Risk Factors
        </h3>
        <div className="space-y-6">
          {Object.entries(riskFactors)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 6)
            .map(([factor, count], index) => {
              const percentage = (count / highRiskCount) * 100;
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
    );
  };

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
      {/* Company Overview Card */}
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

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Customer Base */}
          <div className="bg-white/10 rounded-lg p-4 backdrop-blur-sm">
            <h4 className="text-white/80 text-sm mb-1">Customer Base</h4>
            <p className="text-2xl font-bold">
              {totalRecords.toLocaleString()}
            </p>
            <div className="mt-2 text-sm">
              <span className="px-2 py-0.5 rounded-full bg-green-500/20 text-green-100">
                {((stayCount / totalRecords) * 100).toFixed(1)}% Retention Rate
              </span>
            </div>
          </div>

          {/* Risk Profile */}
          <div className="bg-white/10 rounded-lg p-4 backdrop-blur-sm">
            <h4 className="text-white/80 text-sm mb-1">Risk Profile</h4>
            <p className="text-2xl font-bold">
              {((highRiskCustomers.length / totalRecords) * 100).toFixed(1)}%
            </p>
            <div className="mt-2 text-sm">
              <span className="px-2 py-0.5 rounded-full bg-yellow-500/20 text-yellow-100">
                High Risk Customers
              </span>
            </div>
          </div>

          {/* Potential Impact */}
          <div className="bg-white/10 rounded-lg p-4 backdrop-blur-sm">
            <h4 className="text-white/80 text-sm mb-1">Potential Impact</h4>
            <p className="text-2xl font-bold">{Math.round(churnCount * 0.6)}</p>
            <div className="mt-2 text-sm">
              <span className="px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-100">
                Recoverable Customers
              </span>
            </div>
          </div>
        </div>

        {/* Additional Metrics */}
        <div className="grid grid-cols-2 gap-6 mt-6">
          {/* Customer Segment Distribution */}
          <div className="bg-white/10 rounded-lg p-4">
            <h4 className="text-white/80 text-sm mb-3">
              Customer Segment Distribution
            </h4>
            <div className="space-y-3">
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span>High Value Customers</span>
                  <span>
                    {((highRiskCustomers.length / totalRecords) * 100).toFixed(
                      1
                    )}
                    %
                  </span>
                </div>
                <div className="w-full bg-red-200/20 rounded-full h-2">
                  <div
                    className="bg-red-500 h-2 rounded-full"
                    style={{
                      width: `${(highRiskCustomers.length / totalRecords) * 100}%`,
                    }}
                  />
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
                <div className="w-full bg-yellow-200/20 rounded-full h-2">
                  <div
                    className="bg-yellow-500 h-2 rounded-full"
                    style={{
                      width: `${(mediumRiskCustomers.length / totalRecords) * 100}%`,
                    }}
                  />
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
                <div className="w-full bg-red-200/20 rounded-full h-2">
                  <div
                    className="bg-red-500 h-2 rounded-full"
                    style={{
                      width: `${(highRiskCustomers.length / totalRecords) * 100}%`,
                    }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Key Performance Indicators */}
          <div className="bg-white/10 rounded-lg p-4">
            <h4 className="text-white/80 text-sm mb-3">
              Key Performance Indicators
            </h4>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-sm">Customer Health Score</span>
                  <div className="flex items-center">
                    <span className="text-lg font-semibold">
                      {customerHealthScore}%
                    </span>
                    <svg
                      className="w-4 h-4 ml-1 text-green-400"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
                      />
                    </svg>
                  </div>
                </div>
              </div>
              <div>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-sm">Retention Rate Target</span>
                  <div className="flex items-center">
                    <span className="text-lg font-semibold">
                      {retentionRateTarget}%
                    </span>
                    <svg
                      className="w-4 h-4 ml-1 text-blue-400"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
                      />
                    </svg>
                  </div>
                </div>
              </div>
              <div>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-sm">Action Priority Score</span>
                  <div className="flex items-center">
                    <span className="text-lg font-semibold">
                      {actionPriorityScore}%
                    </span>
                    <svg
                      className="w-4 h-4 ml-1 text-yellow-400"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Customer Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-lg shadow-md">
          <h3 className="text-lg font-medium text-gray-800">Total Customers</h3>
          <p className="text-3xl font-bold text-gray-900 mt-2">
            {totalRecords}
          </p>
          <p className="text-sm text-gray-500 mt-1">
            Processed from customer data
          </p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow-md">
          <h3 className="text-lg font-medium text-red-800">Likely to Churn</h3>
          <p className="text-3xl font-bold text-red-600 mt-2">{churnCount}</p>
          <p className="text-sm text-gray-500 mt-1">
            {((churnCount / totalRecords) * 100).toFixed(1)}% of customers
          </p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow-md">
          <h3 className="text-lg font-medium text-green-800">Likely to Stay</h3>
          <p className="text-3xl font-bold text-green-600 mt-2">{stayCount}</p>
          <p className="text-sm text-gray-500 mt-1">
            {((stayCount / totalRecords) * 100).toFixed(1)}% of customers
          </p>
        </div>
      </div>

      {/* Risk Distribution */}
      <div className="bg-white p-6 rounded-lg shadow-md">
        <h3 className="text-lg font-medium text-gray-800 mb-4">
          Risk Distribution
        </h3>
        <div className="relative h-4 bg-gray-200 rounded-full overflow-hidden">
          <div
            className="absolute left-0 h-full bg-red-500"
            style={{
              width: `${(highRiskCustomers.length / totalRecords) * 100}%`,
            }}
          />
          <div
            className="absolute h-full bg-yellow-500"
            style={{
              left: `${(highRiskCustomers.length / totalRecords) * 100}%`,
              width: `${(mediumRiskCustomers.length / totalRecords) * 100}%`,
            }}
          />
          <div
            className="absolute h-full bg-green-500"
            style={{
              left: `${((highRiskCustomers.length + mediumRiskCustomers.length) / totalRecords) * 100}%`,
              width: `${(lowRiskCustomers.length / totalRecords) * 100}%`,
            }}
          />
        </div>
        <div className="grid grid-cols-3 gap-4 mt-4">
          <div className="text-center">
            <p className="text-red-600 font-semibold">
              {highRiskCustomers.length}
            </p>
            <p className="text-sm text-gray-600">High Risk</p>
            <p className="text-xs text-gray-500">
              {((highRiskCustomers.length / totalRecords) * 100).toFixed(1)}%
            </p>
          </div>
          <div className="text-center">
            <p className="text-yellow-600 font-semibold">
              {mediumRiskCustomers.length}
            </p>
            <p className="text-sm text-gray-600">Medium Risk</p>
            <p className="text-xs text-gray-500">
              {((mediumRiskCustomers.length / totalRecords) * 100).toFixed(1)}%
            </p>
          </div>
          <div className="text-center">
            <p className="text-green-600 font-semibold">
              {lowRiskCustomers.length}
            </p>
            <p className="text-sm text-gray-600">Low Risk</p>
            <p className="text-xs text-gray-500">
              {((lowRiskCustomers.length / totalRecords) * 100).toFixed(1)}%
            </p>
          </div>
        </div>
      </div>

      {/* Detailed Action Plan */}
      <div className="bg-white p-6 rounded-lg shadow-md">
        <h3 className="text-lg font-medium text-gray-800 mb-4 flex items-center">
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

        {/* Immediate Actions */}
        <div className="relative pl-6 mb-6">
          <div className="absolute left-0 top-0 bottom-0 w-1 bg-red-500 rounded"></div>
          <div className="mb-4">
            <div className="flex items-center mb-2">
              <span className="w-8 h-8 rounded-full bg-red-100 text-red-600 mr-2 flex items-center justify-center text-sm">
                24h
              </span>
              <h4 className="text-lg font-medium text-gray-800">
                Immediate Actions (24-48 hours)
              </h4>
            </div>
            <div className="bg-red-50 rounded-lg p-4">
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
                  className="text-red-600 hover:text-red-800"
                >
                  {showHighRiskList ? "Hide List" : "Show List"}
                </button>
              </div>
              {showHighRiskList && renderHighRiskList()}
              <ul className="mt-3 space-y-2 text-sm text-gray-700">
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
                    <p className="font-medium">
                      Contact {highRiskCustomers.length} high-risk customers:
                    </p>
                    <ul className="ml-6 mt-1 list-disc text-gray-600">
                      <li>
                        Prepare personalized retention offers based on customer
                        history
                      </li>
                      <li>
                        Priority outreach to top{" "}
                        {Math.min(100, highRiskCustomers.length)} customers
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
                    <p className="font-medium">Review customer complaints:</p>
                    <ul className="ml-6 mt-1 list-disc text-gray-600">
                      <li>Address all pending issues within 24 hours</li>
                      <li>Escalate to senior management if necessary</li>
                      <li>
                        Set up rapid response team for high priority cases
                      </li>
                    </ul>
                  </div>
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Short-term Actions */}
        <div className="relative pl-6 mb-6">
          <div className="absolute left-0 top-0 bottom-0 w-1 bg-yellow-500 rounded"></div>
          <div className="mb-4">
            <div className="flex items-center mb-2">
              <span className="w-8 h-8 rounded-full bg-yellow-100 text-yellow-600 mr-2 flex items-center justify-center text-sm">
                1w
              </span>
              <h4 className="text-lg font-medium text-gray-800">
                Short-term Actions (1-2 weeks)
              </h4>
            </div>
            <div className="bg-yellow-50 rounded-lg p-4">
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
                  className="text-yellow-600 hover:text-yellow-800"
                >
                  {showMediumRiskList ? "Hide List" : "Show List"}
                </button>
              </div>
              {showMediumRiskList && renderMediumRiskList()}
              <ul className="mt-3 space-y-2 text-sm text-gray-700">
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
                    <p className="font-medium">
                      Engagement campaign for {mediumRiskCustomers.length}{" "}
                      at-risk customers:
                    </p>
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
        <div className="relative pl-6">
          <div className="absolute left-0 top-0 bottom-0 w-1 bg-green-500 rounded"></div>
          <div>
            <div className="flex items-center mb-2">
              <span className="w-8 h-8 rounded-full bg-green-100 text-green-600 mr-2 flex items-center justify-center text-sm">
                1m
              </span>
              <h4 className="text-lg font-medium text-gray-800">
                Long-term Strategy (1-3 months)
              </h4>
            </div>
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
                  className="text-green-600 hover:text-green-800"
                >
                  {showLowRiskList ? "Hide List" : "Show List"}
                </button>
              </div>
              {showLowRiskList && renderLowRiskList()}
              <ul className="mt-3 space-y-2 text-sm text-gray-700">
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
                    <p className="font-medium">Loyalty program enhancements:</p>
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

      {/* Business Impact Analysis */}
      <div className="bg-white p-6 rounded-lg shadow-md">
        <h3 className="text-lg font-medium text-gray-800 mb-6">
          Business Impact Analysis
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-yellow-50 rounded-lg p-4">
            <h4 className="font-semibold text-yellow-800 mb-2">
              Revenue at Risk
            </h4>
            <p className="text-xl font-bold text-yellow-700">
              {churnCount} Customers
            </p>
            <p className="text-sm text-yellow-600 mt-1">At risk of churning</p>
            <p className="text-xl font-bold text-yellow-700 mt-3">
              {Math.round(churnCount * 0.6)}
            </p>
            <p className="text-sm text-yellow-600">Potentially recoverable</p>
          </div>

          <div className="bg-emerald-50 rounded-lg p-4">
            <h4 className="font-semibold text-emerald-800 mb-2">
              Retention Priority
            </h4>
            <p className="text-xl font-bold text-emerald-700">
              {mediumRiskCustomers.length} Customers
            </p>
            <p className="text-sm text-emerald-600 mt-1">
              Medium risk - Highest ROI opportunity
            </p>
            <p className="text-xl font-bold text-emerald-700 mt-3">
              {((mediumRiskCustomers.length / totalRecords) * 100).toFixed(1)}%
            </p>
            <p className="text-sm text-emerald-600">Of total customer base</p>
          </div>

          <div className="bg-blue-50 rounded-lg p-4">
            <h4 className="font-semibold text-blue-800 mb-2">
              Loyalty Potential
            </h4>
            <p className="text-xl font-bold text-blue-700">
              {lowRiskCustomers.length} Customers
            </p>
            <p className="text-sm text-blue-600 mt-1">
              Loyal customers for referrals
            </p>
            <p className="text-xl font-bold text-blue-700 mt-3">
              {((lowRiskCustomers.length / totalRecords) * 100).toFixed(1)}%
            </p>
            <p className="text-sm text-blue-600">Potential brand ambassadors</p>
          </div>
        </div>

        {/* Strategic Recommendations and Expected Outcomes */}
        <div className="grid grid-cols-2 gap-6 mt-6">
          <div>
            <h4 className="font-medium text-gray-700 mb-3">
              Strategic Recommendations
            </h4>
            <ul className="space-y-2">
              <li className="flex items-start text-sm text-gray-600">
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
                Implement personalized retention offers for high-risk segment
              </li>
              <li className="flex items-start text-sm text-gray-600">
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
                Launch targeted loyalty program for medium-risk customers
              </li>
              <li className="flex items-start text-sm text-gray-600">
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
                Develop referral program leveraging loyal customer base
              </li>
            </ul>
          </div>
          <div>
            <h4 className="font-medium text-gray-700 mb-3">
              Expected Outcomes
            </h4>
            <ul className="space-y-2">
              <li className="flex items-start text-sm text-gray-600">
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
              <li className="flex items-start text-sm text-gray-600">
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
                Improve retention rate by up to {retentionRateTarget}% through
                retention & engagement
              </li>
              <li className="flex items-start text-sm text-gray-600">
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
                {Math.round(lowRiskCustomers.length * 0.3)} potential referrals
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
            {currentData.map((prediction, index) => (
              <tr
                key={prediction.customerID || index}
                className="hover:bg-gray-50"
              >
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                  {prediction.customerID || `Customer ${index + 1}`}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
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
                <td className="px-6 py-4 whitespace-nowrap">
                  <span
                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      prediction.churnProbability > 0.7
                        ? "bg-red-100 text-red-800"
                        : prediction.churnProbability > 0.3
                          ? "bg-yellow-100 text-yellow-800"
                          : "bg-green-100 text-green-800"
                    }`}
                  >
                    {prediction.churnProbability > 0.7
                      ? "High"
                      : prediction.churnProbability > 0.3
                        ? "Medium"
                        : "Low"}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center text-green-600">
                    <FaCheckCircle className="mr-1.5 h-4 w-4" />
                    <span className="text-xs text-gray-600">Processed</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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

  const renderCharts = () => {
    // Calculate churn percentage here to ensure it's available
    const calculatedChurnPercentage = (churnCount / totalRecords) * 100;

    return (
      <div className="space-y-6">
        {/* Risk Level Distribution */}
        <div className="bg-white p-6 rounded-lg shadow-md border border-gray-200">
          <h3 className="text-lg font-semibold text-gray-700 mb-4">
            Risk Level Distribution
          </h3>
          <div className="h-80 flex items-end justify-around px-10">
            <div className="flex flex-col items-center">
              <div
                className="w-32 bg-red-500 rounded-t-md transition-all duration-500 ease-in-out hover:opacity-80"
                style={{
                  height: `${Math.max((highRiskCustomers.length / chunks.length) * 300, 2)}px`,
                  minHeight: "2px",
                }}
              >
                <div className="text-white text-center py-2">
                  {((highRiskCustomers.length / chunks.length) * 100).toFixed(
                    1
                  )}
                  %
                </div>
              </div>
              <p className="mt-2 text-sm font-medium">High Risk</p>
              <p className="text-xs text-gray-500">
                {highRiskCustomers.length} customers
              </p>
            </div>
            <div className="flex flex-col items-center">
              <div
                className="w-32 bg-yellow-500 rounded-t-md transition-all duration-500 ease-in-out hover:opacity-80"
                style={{
                  height: `${Math.max((mediumRiskCustomers.length / chunks.length) * 300, 2)}px`,
                  minHeight: "2px",
                }}
              >
                <div className="text-white text-center py-2">
                  {((mediumRiskCustomers.length / chunks.length) * 100).toFixed(
                    1
                  )}
                  %
                </div>
              </div>
              <p className="mt-2 text-sm font-medium">Medium Risk</p>
              <p className="text-xs text-gray-500">
                {mediumRiskCustomers.length} customers
              </p>
            </div>
            <div className="flex flex-col items-center">
              <div
                className="w-32 bg-green-500 rounded-t-md transition-all duration-500 ease-in-out hover:opacity-80"
                style={{
                  height: `${Math.max((lowRiskCustomers.length / chunks.length) * 300, 2)}px`,
                  minHeight: "2px",
                }}
              >
                <div className="text-white text-center py-2">
                  {((lowRiskCustomers.length / chunks.length) * 100).toFixed(1)}
                  %
                </div>
              </div>
              <p className="mt-2 text-sm font-medium">Low Risk</p>
              <p className="text-xs text-gray-500">
                {lowRiskCustomers.length} customers
              </p>
            </div>
          </div>
        </div>

        {/* Churn Distribution */}
        <div className="bg-white p-6 rounded-lg shadow-md border border-gray-200">
          <h3 className="text-lg font-semibold text-gray-700 mb-4">
            Churn Prediction Distribution
          </h3>
          <div className="flex justify-center">
            <div className="relative w-64 h-64">
              <svg viewBox="0 0 100 100" className="w-full h-full">
                <path
                  d={`M 50 50 L 50 0 A 50 50 0 ${calculatedChurnPercentage > 50 ? 0 : 1} 1 ${50 + 50 * Math.sin((2 * Math.PI * calculatedChurnPercentage) / 100)} ${50 - 50 * Math.cos((2 * Math.PI * calculatedChurnPercentage) / 100)} Z`}
                  fill="#10B981"
                />
                <path
                  d={`M 50 50 L ${50 + 50 * Math.sin((2 * Math.PI * calculatedChurnPercentage) / 100)} ${50 - 50 * Math.cos((2 * Math.PI * calculatedChurnPercentage) / 100)} A 50 50 0 ${calculatedChurnPercentage > 50 ? 1 : 0} 1 50 0 Z`}
                  fill="#EF4444"
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center flex-col">
                <p className="text-3xl font-bold text-gray-800">
                  {calculatedChurnPercentage.toFixed(1)}%
                </p>
                <p className="text-sm text-gray-500">Churn Rate</p>
              </div>
            </div>
          </div>
          <div className="flex justify-center mt-4 space-x-8">
            <div className="flex items-center">
              <div className="w-4 h-4 bg-red-500 rounded-full mr-2"></div>
              <span className="text-sm text-gray-600">
                Likely to Churn ({churnCount})
              </span>
            </div>
            <div className="flex items-center">
              <div className="w-4 h-4 bg-green-500 rounded-full mr-2"></div>
              <span className="text-sm text-gray-600">
                Likely to Stay ({stayCount})
              </span>
            </div>
          </div>
        </div>

        {/* Customer Activity Trends */}
        <div className="bg-white p-6 rounded-lg shadow-md border border-gray-200">
          <h3 className="text-lg font-semibold text-gray-700 mb-4">
            Customer Activity Trends
          </h3>
          <div className="h-80 relative">
            {(() => {
              // Group customers by tenure and calculate average metrics
              const tenureGroups = {};
              chunks.forEach((p) => {
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

              return (
                <>
                  <div className="absolute inset-0 grid grid-cols-12 gap-0">
                    {Array.from({ length: 13 }).map((_, i) => (
                      <div
                        key={i}
                        className="border-l border-gray-100 h-full"
                      />
                    ))}
                  </div>
                  <div className="absolute inset-0 grid grid-rows-8 gap-0">
                    {Array.from({ length: 9 }).map((_, i) => (
                      <div
                        key={i}
                        className="border-t border-gray-100 w-full"
                      />
                    ))}
                  </div>

                  <svg
                    className="w-full h-full"
                    viewBox="0 0 1200 800"
                    preserveAspectRatio="none"
                  >
                    <path
                      d={tenures
                        .map((t, i) => {
                          const x = (parseInt(t) / maxTenure) * 1200;
                          const y =
                            800 - (avgOrders[i] / Math.max(...avgOrders)) * 700;
                          return `${i === 0 ? "M" : "L"} ${x} ${y}`;
                        })
                        .join(" ")}
                      stroke="#EF4444"
                      strokeWidth="2"
                      fill="none"
                    />
                    <path
                      d={tenures
                        .map((t, i) => {
                          const x = (parseInt(t) / maxTenure) * 1200;
                          const y =
                            800 -
                            (avgSpending[i] / Math.max(...avgSpending)) * 700;
                          return `${i === 0 ? "M" : "L"} ${x} ${y}`;
                        })
                        .join(" ")}
                      stroke="#10B981"
                      strokeWidth="2"
                      fill="none"
                    />
                    <path
                      d={tenures
                        .map((t, i) => {
                          const x = (parseInt(t) / maxTenure) * 1200;
                          const y =
                            800 -
                            (avgAppHours[i] / Math.max(...avgAppHours)) * 700;
                          return `${i === 0 ? "M" : "L"} ${x} ${y}`;
                        })
                        .join(" ")}
                      stroke="#6366F1"
                      strokeWidth="2"
                      fill="none"
                    />
                  </svg>

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

        {/* Risk Factors Analysis */}
        <div className="bg-white p-6 rounded-lg shadow-md border border-gray-200">
          <h3 className="text-lg font-semibold text-gray-700 mb-4">
            Risk Factors Analysis
          </h3>
          <div className="space-y-6">
            {(() => {
              const riskFactors = chunks.reduce((acc, pred) => {
                if (pred.churnProbability > 0.5) {
                  const factors = [];
                  if (pred.formData?.SatisfactionScore <= 2)
                    factors.push("Low Satisfaction Score");
                  if (pred.formData?.Complain === "1")
                    factors.push("Has Active Complaints");
                  if (parseInt(pred.formData?.DaySinceLastOrder) > 30)
                    factors.push("Inactive > 30 Days");
                  if (parseInt(pred.formData?.OrderCount) <= 2)
                    factors.push("Low Order Count");
                  if (
                    parseFloat(pred.formData?.OrderAmountHikeFromlastYear) < 0
                  )
                    factors.push("Declining Order Value");
                  if (parseInt(pred.formData?.Tenure) <= 3)
                    factors.push("New Customer (≤3 months)");
                  if (parseInt(pred.formData?.CouponUsed) === 0)
                    factors.push("No Coupon Usage");
                  if (parseFloat(pred.formData?.HourSpendOnApp) < 1.5)
                    factors.push("Low App Engagement");

                  factors.forEach((factor) => {
                    acc[factor] = (acc[factor] || 0) + 1;
                  });
                }
                return acc;
              }, {});

              const highRiskCount = chunks.filter(
                (p) => p.churnProbability > 0.7
              ).length;
              const colors = [
                "from-red-500 to-red-400",
                "from-orange-500 to-orange-400",
                "from-yellow-500 to-yellow-400",
                "from-amber-500 to-amber-400",
                "from-rose-500 to-rose-400",
                "from-pink-500 to-pink-400",
              ];

              return Object.entries(riskFactors)
                .sort(([, a], [, b]) => b - a)
                .slice(0, 6)
                .map(([factor, count], index) => {
                  const percentage = (count / highRiskCount) * 100;
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
                });
            })()}
          </div>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen flex justify-center items-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#1d5a7b]"></div>
      </div>
    );
  }

  if (!batchData) {
    return (
      <div className="min-h-screen flex justify-center items-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-800 mb-4">
            Batch Prediction Not Found
          </h2>
          <button
            onClick={() => navigate("/account")}
            className="bg-[#1d5a7b] text-white px-6 py-2 rounded-lg hover:bg-[#164e68] transition-colors"
          >
            Back to Account
          </button>
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-gray-50 pt-[140px] pb-12 px-4">
        <div className="max-w-7xl mx-auto">
          {/* Header Section */}
          <div className="bg-white rounded-xl shadow-lg p-6 mb-8">
            <div className="flex justify-between items-start mb-6">
              <div>
                <h1 className="text-2xl font-bold text-gray-800 mb-2">
                  Batch Prediction Details
                </h1>
                <p className="text-gray-600">File: {batchData.fileName}</p>
                <p className="text-gray-600">
                  Processed on:{" "}
                  {new Date(batchData.saveTimestamp).toLocaleString()}
                </p>
              </div>
              <div className="flex gap-4">
                <button
                  onClick={handleDownloadCSV}
                  className="flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                >
                  <FaDownload className="mr-2" /> Download CSV
                </button>
                <button
                  onClick={() => navigate("/account")}
                  className="bg-gray-100 text-gray-600 px-4 py-2 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  Back to Account
                </button>
              </div>
            </div>

            {/* View Mode Tabs */}
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
            <div className="mt-6">
              {viewMode === "summary" && renderSummary()}
              {viewMode === "table" && (
                <div className="space-y-4">
                  {renderTable()}
                  {renderPagination()}
                </div>
              )}
              {viewMode === "charts" && renderCharts()}
            </div>
          </div>
        </div>
      </div>
    </ErrorBoundary>
  );
};

export default BatchPredictionDetail;
