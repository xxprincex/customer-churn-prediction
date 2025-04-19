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

const SummaryView = ({ data }) => {
  const { batchData, chunks } = data;
  const [showHighRiskList, setShowHighRiskList] = useState(false);
  const [showMediumRiskList, setShowMediumRiskList] = useState(false);
  const [showLowRiskList, setShowLowRiskList] = useState(false);

  // Calculate metrics
  const totalRecords = chunks.length;
  const highRiskCustomers = chunks.filter((p) => p.churnProbability > 0.7);
  const mediumRiskCustomers = chunks.filter(
    (p) => p.churnProbability > 0.3 && p.churnProbability <= 0.7
  );
  const lowRiskCustomers = chunks.filter((p) => p.churnProbability <= 0.3);
  const churnCount = chunks.filter((p) => p.prediction === 1).length;
  const stayCount = totalRecords - churnCount;
  const churnPercentage = ((churnCount / totalRecords) * 100).toFixed(1);
  const customerHealthScore = (
    ((lowRiskCustomers.length + mediumRiskCustomers.length * 0.5) /
      totalRecords) *
    100
  ).toFixed(1);
  const retentionRateTarget = Math.min(95, 100 - parseFloat(churnPercentage));
  const actionPriorityScore = Math.min(
    100,
    Math.round(
      (highRiskCustomers.length / totalRecords) * 100 +
        (mediumRiskCustomers.length / totalRecords) * 50
    )
  );

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

  return (
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
    </div>
  );
};

const TableView = ({ data }) => {
  const { chunks } = data;
  const [currentPage, setCurrentPage] = useState(1);
  const [sortField, setSortField] = useState("churnProbability");
  const [sortDirection, setSortDirection] = useState("desc");

  // Memoized sorted data
  const sortedData = useMemo(() => {
    const sorted = [...chunks].sort((a, b) => {
      const aValue = a[sortField];
      const bValue = b[sortField];
      return sortDirection === "asc" ? aValue - bValue : bValue - aValue;
    });
    return sorted;
  }, [chunks, sortField, sortDirection]);

  // Pagination calculations
  const totalPages = Math.ceil(chunks.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const currentData = sortedData.slice(startIndex, endIndex);

  // Handlers
  const handleSort = (field) => {
    setSortField(field);
    setSortDirection((current) =>
      field === sortField ? (current === "asc" ? "desc" : "asc") : "desc"
    );
  };

  const handlePageChange = (page) => {
    setCurrentPage(page);
  };

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

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort("customerID")}
                >
                  <div className="flex items-center">
                    Customer ID
                    {sortField === "customerID" && (
                      <span className="ml-2">
                        {sortDirection === "asc" ? "↑" : "↓"}
                      </span>
                    )}
                  </div>
                </th>
                <th
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort("prediction")}
                >
                  <div className="flex items-center">
                    Prediction
                    {sortField === "prediction" && (
                      <span className="ml-2">
                        {sortDirection === "asc" ? "↑" : "↓"}
                      </span>
                    )}
                  </div>
                </th>
                <th
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort("churnProbability")}
                >
                  <div className="flex items-center">
                    Churn Probability
                    {sortField === "churnProbability" && (
                      <span className="ml-2">
                        {sortDirection === "asc" ? "↑" : "↓"}
                      </span>
                    )}
                  </div>
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
    </div>
  );
};

const ChartsView = ({ data }) => {
  const { chunks } = data;

  // Calculate metrics
  const totalRecords = chunks.length;
  const highRiskCustomers = chunks.filter((p) => p.churnProbability > 0.7);
  const mediumRiskCustomers = chunks.filter(
    (p) => p.churnProbability > 0.3 && p.churnProbability <= 0.7
  );
  const lowRiskCustomers = chunks.filter((p) => p.churnProbability <= 0.3);
  const churnCount = chunks.filter((p) => p.prediction === 1).length;
  const stayCount = totalRecords - churnCount;
  const churnPercentage = (churnCount / totalRecords) * 100;

  return (
    <div className="space-y-6">
      {/* Risk Level Distribution */}
      <div className="bg-white p-6 rounded-lg shadow-md border border-gray-200">
        <h3 className="text-lg font-semibold text-gray-700 mb-4">
          Risk Level Distribution
        </h3>
        <div className="h-80 flex items-end justify-around px-10">
          {[
            {
              type: "High Risk",
              count: highRiskCustomers.length,
              color: "bg-red-500",
              percentage: (highRiskCustomers.length / totalRecords) * 100,
            },
            {
              type: "Medium Risk",
              count: mediumRiskCustomers.length,
              color: "bg-yellow-500",
              percentage: (mediumRiskCustomers.length / totalRecords) * 100,
            },
            {
              type: "Low Risk",
              count: lowRiskCustomers.length,
              color: "bg-green-500",
              percentage: (lowRiskCustomers.length / totalRecords) * 100,
            },
          ].map((risk) => (
            <div key={risk.type} className="flex flex-col items-center">
              <div
                className={`w-32 ${risk.color} rounded-t-md transition-all duration-500 ease-in-out hover:opacity-80`}
                style={{
                  height: `${Math.max((risk.count / totalRecords) * 300, 2)}px`,
                  minHeight: "2px",
                }}
              >
                <div className="text-white text-center py-2">
                  {risk.percentage.toFixed(1)}%
                </div>
              </div>
              <p className="mt-2 text-sm font-medium">{risk.type}</p>
              <p className="text-xs text-gray-500">{risk.count} customers</p>
            </div>
          ))}
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

const BatchPredictionDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [batchData, setBatchData] = useState(null);
  const [chunks, setChunks] = useState([]);
  const [viewMode, setViewMode] = useState("summary");

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

  const handleDownloadCSV = useCallback(() => {
    const headers = [
      "CustomerID",
      "Prediction",
      "Churn Probability",
      "Risk Level",
      "Status",
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
          p.prediction === 1 ? "Will Churn" : "Will Stay",
          (p.churnProbability * 100).toFixed(1) + "%",
          riskLevel,
          "Processed",
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

  const viewComponents = {
    summary: SummaryView,
    table: TableView,
    charts: ChartsView,
  };

  const CurrentView = viewComponents[viewMode];

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
              {Object.keys(viewComponents).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setViewMode(mode)}
                  className={`px-4 py-2 rounded-full ${
                    viewMode === mode
                      ? "bg-[#1d5a7b] text-white"
                      : "bg-gray-200 text-gray-700"
                  }`}
                >
                  {mode.charAt(0).toUpperCase() + mode.slice(1)}
                </button>
              ))}
            </div>

            {/* Content based on view mode */}
            <div className="mt-6">
              <CurrentView data={{ batchData, chunks }} />
            </div>
          </div>
        </div>
      </div>
    </ErrorBoundary>
  );
};

export default BatchPredictionDetail;
