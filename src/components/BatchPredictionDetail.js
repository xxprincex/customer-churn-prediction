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

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
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
            <h4 className="text-white/80 text-sm mb-1">
              Customer Health Score
            </h4>
            <p className="text-2xl font-bold">{customerHealthScore}%</p>
            <div className="flex items-center mt-2 text-sm">
              <span className="px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-100">
                Overall Health
              </span>
            </div>
          </div>

          <div className="bg-white/10 rounded-lg p-4 backdrop-blur-sm">
            <h4 className="text-white/80 text-sm mb-1">
              Action Priority Score
            </h4>
            <p className="text-2xl font-bold">{actionPriorityScore}</p>
            <div className="flex items-center mt-2 text-sm">
              <span className="px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-100">
                Intervention Priority
              </span>
            </div>
          </div>
        </div>

        {/* Key Performance Indicators */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
          <div className="bg-white/10 rounded-lg p-4 backdrop-blur-sm">
            <h4 className="text-white/80 text-sm mb-3">
              Churn Risk Distribution
            </h4>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span>High Risk</span>
                <span className="font-semibold">
                  {((highRiskCustomers.length / totalRecords) * 100).toFixed(1)}
                  %
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span>Medium Risk</span>
                <span className="font-semibold">
                  {((mediumRiskCustomers.length / totalRecords) * 100).toFixed(
                    1
                  )}
                  %
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span>Low Risk</span>
                <span className="font-semibold">
                  {((lowRiskCustomers.length / totalRecords) * 100).toFixed(1)}%
                </span>
              </div>
            </div>
          </div>

          <div className="bg-white/10 rounded-lg p-4 backdrop-blur-sm">
            <h4 className="text-white/80 text-sm mb-3">Retention Metrics</h4>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span>Current Rate</span>
                <span className="font-semibold">
                  {((stayCount / totalRecords) * 100).toFixed(1)}%
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span>Target Rate</span>
                <span className="font-semibold">{retentionRateTarget}%</span>
              </div>
              <div className="flex justify-between items-center">
                <span>Gap to Target</span>
                <span className="font-semibold">
                  {(
                    retentionRateTarget -
                    (stayCount / totalRecords) * 100
                  ).toFixed(1)}
                  %
                </span>
              </div>
            </div>
          </div>

          <div className="bg-white/10 rounded-lg p-4 backdrop-blur-sm">
            <h4 className="text-white/80 text-sm mb-3">Customer Engagement</h4>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span>Active Users</span>
                <span className="font-semibold">
                  {(
                    (chunks.filter(
                      (c) => parseFloat(c.formData?.HourSpendOnApp) > 2
                    ).length /
                      totalRecords) *
                    100
                  ).toFixed(1)}
                  %
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span>Regular Orders</span>
                <span className="font-semibold">
                  {(
                    (chunks.filter((c) => parseInt(c.formData?.OrderCount) > 5)
                      .length /
                      totalRecords) *
                    100
                  ).toFixed(1)}
                  %
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span>Coupon Usage</span>
                <span className="font-semibold">
                  {(
                    (chunks.filter((c) => parseInt(c.formData?.CouponUsed) > 0)
                      .length /
                      totalRecords) *
                    100
                  ).toFixed(1)}
                  %
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Risk Analysis and Action Plan */}
      <div className="bg-white p-6 rounded-lg shadow-md">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">
          Risk Analysis & Action Plan
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* High Risk Segment */}
          <div className="bg-red-50 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-semibold text-red-800">High Risk Segment</h4>
              <span className="text-sm text-red-600 bg-red-100 px-2 py-1 rounded-full">
                {highRiskCustomers.length} Customers
              </span>
            </div>
            <div className="space-y-2">
              <p className="text-sm text-red-700">
                <span className="font-medium">Primary Concerns:</span>
                <ul className="list-disc ml-5 mt-1">
                  <li>Low satisfaction scores (≤ 2)</li>
                  <li>Active complaints</li>
                  <li>Declining order value</li>
                  <li>Minimal app engagement</li>
                </ul>
              </p>
              <p className="text-sm text-red-700">
                <span className="font-medium">Recommended Actions:</span>
                <ul className="list-disc ml-5 mt-1">
                  <li>Immediate personalized outreach</li>
                  <li>Priority complaint resolution</li>
                  <li>Custom retention offers</li>
                  <li>Account review within 24 hours</li>
                </ul>
              </p>
            </div>
          </div>

          {/* Medium Risk Segment */}
          <div className="bg-yellow-50 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-semibold text-yellow-800">
                Medium Risk Segment
              </h4>
              <span className="text-sm text-yellow-600 bg-yellow-100 px-2 py-1 rounded-full">
                {mediumRiskCustomers.length} Customers
              </span>
            </div>
            <div className="space-y-2">
              <p className="text-sm text-yellow-700">
                <span className="font-medium">Key Indicators:</span>
                <ul className="list-disc ml-5 mt-1">
                  <li>Moderate satisfaction (3-4)</li>
                  <li>Decreasing engagement</li>
                  <li>Irregular order patterns</li>
                  <li>Limited feature usage</li>
                </ul>
              </p>
              <p className="text-sm text-yellow-700">
                <span className="font-medium">Suggested Interventions:</span>
                <ul className="list-disc ml-5 mt-1">
                  <li>Engagement campaign</li>
                  <li>Feature education</li>
                  <li>Loyalty program invitation</li>
                  <li>Satisfaction survey</li>
                </ul>
              </p>
            </div>
          </div>
        </div>

        {/* Customer Value Analysis */}
        <div className="mt-6 bg-blue-50 rounded-lg p-4">
          <h4 className="font-semibold text-blue-800 mb-3">
            Customer Value Analysis
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white rounded-lg p-3">
              <h5 className="text-sm font-medium text-gray-700 mb-2">
                Average Order Value
              </h5>
              <div className="flex items-baseline">
                <span className="text-2xl font-bold text-blue-600">
                  ${calculateAverageOrderValue()}
                </span>
                <span className="ml-2 text-sm text-gray-500">per customer</span>
              </div>
            </div>
            <div className="bg-white rounded-lg p-3">
              <h5 className="text-sm font-medium text-gray-700 mb-2">
                Lifetime Value at Risk
              </h5>
              <div className="flex items-baseline">
                <span className="text-2xl font-bold text-blue-600">
                  ${calculateLifetimeValueAtRisk()}
                </span>
                <span className="ml-2 text-sm text-gray-500">
                  potential loss
                </span>
              </div>
            </div>
            <div className="bg-white rounded-lg p-3">
              <h5 className="text-sm font-medium text-gray-700 mb-2">
                Recovery Opportunity
              </h5>
              <div className="flex items-baseline">
                <span className="text-2xl font-bold text-blue-600">
                  ${calculateRecoveryOpportunity()}
                </span>
                <span className="ml-2 text-sm text-gray-500">recoverable</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Engagement Insights */}
      <div className="bg-white p-6 rounded-lg shadow-md">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">
          Engagement Insights
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h4 className="font-medium text-gray-700 mb-3">
              Activity Patterns
            </h4>
            <div className="space-y-3">{renderActivityPatterns()}</div>
          </div>
          <div>
            <h4 className="font-medium text-gray-700 mb-3">
              Behavioral Indicators
            </h4>
            <div className="space-y-3">{renderBehavioralIndicators()}</div>
          </div>
        </div>
      </div>
    </div>
  );

  // Helper functions for calculations
  const calculateAverageOrderValue = () => {
    const totalOrders = chunks.reduce(
      (sum, c) => sum + (parseInt(c.formData?.OrderCount) || 0),
      0
    );
    const totalValue = chunks.reduce(
      (sum, c) =>
        sum + (parseFloat(c.formData?.OrderAmountHikeFromlastYear) || 0),
      0
    );
    return (totalValue / totalOrders || 0).toFixed(2);
  };

  const calculateLifetimeValueAtRisk = () => {
    const avgOrderValue = parseFloat(calculateAverageOrderValue());
    const highRiskTotal = highRiskCustomers.length * avgOrderValue;
    return Math.round(highRiskTotal).toFixed(2);
  };

  const calculateRecoveryOpportunity = () => {
    const lifetimeValueAtRisk = parseFloat(calculateLifetimeValueAtRisk());
    return (lifetimeValueAtRisk * 0.6).toFixed(2); // Assuming 60% recovery potential
  };

  const renderActivityPatterns = () => {
    const patterns = [
      {
        label: "Daily Active Users",
        value: (
          (chunks.filter((c) => parseFloat(c.formData?.HourSpendOnApp) > 0)
            .length /
            totalRecords) *
          100
        ).toFixed(1),
        color: "bg-green-500",
      },
      {
        label: "Weekly Orders",
        value: (
          (chunks.filter((c) => parseInt(c.formData?.OrderCount) > 0).length /
            totalRecords) *
          100
        ).toFixed(1),
        color: "bg-blue-500",
      },
      {
        label: "Feature Adoption",
        value: (
          (chunks.filter((c) => parseInt(c.formData?.CouponUsed) > 0).length /
            totalRecords) *
          100
        ).toFixed(1),
        color: "bg-purple-500",
      },
    ];

    return patterns.map((pattern, index) => (
      <div key={index} className="flex items-center">
        <div className="flex-grow">
          <div className="flex justify-between mb-1">
            <span className="text-sm text-gray-600">{pattern.label}</span>
            <span className="text-sm font-medium text-gray-700">
              {pattern.value}%
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className={`${pattern.color} h-2 rounded-full`}
              style={{ width: `${pattern.value}%` }}
            />
          </div>
        </div>
      </div>
    ));
  };

  const renderBehavioralIndicators = () => {
    const indicators = [
      {
        label: "Satisfaction Score",
        value: calculateAverageSatisfaction(),
        target: 4.5,
        color: "bg-yellow-500",
      },
      {
        label: "Engagement Score",
        value: calculateEngagementScore(),
        target: 80,
        color: "bg-indigo-500",
      },
      {
        label: "Loyalty Index",
        value: calculateLoyaltyIndex(),
        target: 75,
        color: "bg-pink-500",
      },
    ];

    return indicators.map((indicator, index) => (
      <div key={index} className="flex items-center">
        <div className="flex-grow">
          <div className="flex justify-between mb-1">
            <span className="text-sm text-gray-600">{indicator.label}</span>
            <span className="text-sm font-medium text-gray-700">
              {indicator.value} / {indicator.target}
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className={`${indicator.color} h-2 rounded-full`}
              style={{
                width: `${(indicator.value / indicator.target) * 100}%`,
              }}
            />
          </div>
        </div>
      </div>
    ));
  };

  const calculateAverageSatisfaction = () => {
    const total = chunks.reduce(
      (sum, c) => sum + (parseInt(c.formData?.SatisfactionScore) || 0),
      0
    );
    return (total / chunks.length || 0).toFixed(1);
  };

  const calculateEngagementScore = () => {
    const appUsage = chunks.filter(
      (c) => parseFloat(c.formData?.HourSpendOnApp) > 2
    ).length;
    const orderFrequency = chunks.filter(
      (c) => parseInt(c.formData?.OrderCount) > 5
    ).length;
    const couponUsage = chunks.filter(
      (c) => parseInt(c.formData?.CouponUsed) > 0
    ).length;

    return (
      ((appUsage + orderFrequency + couponUsage) / (totalRecords * 3)) *
      100
    ).toFixed(1);
  };

  const calculateLoyaltyIndex = () => {
    const satisfaction = parseFloat(calculateAverageSatisfaction());
    const engagement = parseFloat(calculateEngagementScore());
    return ((satisfaction * 10 + engagement) / 2).toFixed(1);
  };

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
                    <span className="text-xs">Processed</span>
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

  const renderCharts = () => (
    <div className="space-y-6">
      {/* Risk Level Distribution - Already exists */}
      {renderRiskDistribution()}

      {/* Churn Distribution - Already exists */}
      {renderChurnDistribution()}

      {/* Risk Factors Analysis - Already exists */}
      {renderRiskFactorsAnalysis()}

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
                        const y =
                          800 - (avgOrders[i] / Math.max(...avgOrders)) * 700;
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

                  {/* App Hours Line */}
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
                return values.reduce((a, b) => a + b, 0) / values.length;
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
                              background: `linear-gradient(to right, rgba(99, 102, 241, ${
                                intensity / 100
                              }), rgba(99, 102, 241, ${intensity / 100}))`,
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

      {/* Correlation Scatter Plot */}
      <div className="bg-white p-6 rounded-lg shadow-md border border-gray-200">
        <h3 className="text-lg font-semibold text-gray-700 mb-4">
          Order Value vs. App Engagement
        </h3>
        <div className="h-80 relative">
          {(() => {
            // Extract data points
            const dataPoints = chunks.map((p) => ({
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

            // Calculate monthly churn rate from the data
            const monthStart = new Date(year, month.getMonth(), 1);
            const monthEnd = new Date(year, month.getMonth() + 1, 0);

            const monthlyPredictions = chunks.filter((p) => {
              const predDate = new Date(p.formData?.LastPurchaseDate);
              return predDate >= monthStart && predDate <= monthEnd;
            });

            const monthlyChurn = monthlyPredictions.filter(
              (p) => p.prediction === 1
            ).length;
            const churnRate =
              monthlyPredictions.length > 0
                ? (monthlyChurn / monthlyPredictions.length) * 100
                : 0;

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

            chunks.forEach((p) => {
              const orderCount = parseInt(p.formData?.OrderCount) || 0;
              if (orderCount <= 2) orderGroups["0-2 orders"]++;
              else if (orderCount <= 5) orderGroups["3-5 orders"]++;
              else if (orderCount <= 10) orderGroups["6-10 orders"]++;
              else if (orderCount <= 15) orderGroups["11-15 orders"]++;
              else orderGroups["16+ orders"]++;
            });

            return Object.entries(orderGroups).map(([range, count]) => {
              const percentage = (count / chunks.length) * 100;
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

                chunks.forEach((p) => {
                  const hours = parseFloat(p.formData?.HourSpendOnApp) || 0;
                  if (hours < 1) usageGroups["< 1 hour"]++;
                  else if (hours < 2) usageGroups["1-2 hours"]++;
                  else if (hours < 3) usageGroups["2-3 hours"]++;
                  else if (hours < 4) usageGroups["3-4 hours"]++;
                  else usageGroups["4+ hours"]++;
                });

                return Object.entries(usageGroups).map(([range, count]) => {
                  const percentage = (count / chunks.length) * 100;
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
                chunks.forEach((p) => {
                  const devices =
                    parseInt(p.formData?.NumberOfDeviceRegistered) || 0;
                  deviceCounts[devices] = (deviceCounts[devices] || 0) + 1;
                });

                return Object.entries(deviceCounts)
                  .sort(([a], [b]) => parseInt(a) - parseInt(b))
                  .map(([devices, count]) => {
                    const percentage = (count / chunks.length) * 100;
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
            chunks.forEach((p) => {
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
                const percentage = (count / chunks.length) * 100;
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
            chunks.forEach((p) => {
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
              const percentage = (count / chunks.length) * 100;
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
    </div>
  );

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

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
              <div className="bg-blue-50 rounded-lg p-4">
                <h3 className="text-sm font-medium text-blue-800 mb-1">
                  Total Records
                </h3>
                <p className="text-2xl font-bold text-blue-900">
                  {batchData.totalRecords}
                </p>
              </div>
              <div className="bg-red-50 rounded-lg p-4">
                <h3 className="text-sm font-medium text-red-800 mb-1">
                  High Risk
                </h3>
                <p className="text-2xl font-bold text-red-900">
                  {batchData.summary?.highRiskCount || 0}
                </p>
              </div>
              <div className="bg-yellow-50 rounded-lg p-4">
                <h3 className="text-sm font-medium text-yellow-800 mb-1">
                  Medium Risk
                </h3>
                <p className="text-2xl font-bold text-yellow-900">
                  {batchData.summary?.mediumRiskCount || 0}
                </p>
              </div>
              <div className="bg-green-50 rounded-lg p-4">
                <h3 className="text-sm font-medium text-green-800 mb-1">
                  Low Risk
                </h3>
                <p className="text-2xl font-bold text-green-900">
                  {batchData.summary?.lowRiskCount || 0}
                </p>
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
            {viewMode === "summary" && renderSummary()}
            {viewMode === "table" && (
              <>
                {renderTable()}
                {renderPagination()}
              </>
            )}
            {viewMode === "charts" && (
              <div className="space-y-8">{renderCharts()}</div>
            )}
          </div>
        </div>
      </div>
    </ErrorBoundary>
  );
};

export default BatchPredictionDetail;
