import React, { useState, useRef, useEffect } from "react";
import { toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import Papa from "papaparse";
import {
  collection,
  addDoc,
  serverTimestamp,
  getDoc,
  doc,
} from "firebase/firestore";
import { db, auth } from "../firebase";
import { useNavigate } from "react-router-dom";
import useOnlineStatus from "../utils/useOnlineStatus";
import CsvResults from "./CsvResults";
import {
  FaCrown,
  FaFileUpload,
  FaFileDownload,
  FaInfoCircle,
  FaCheckCircle,
  FaTimesCircle,
  FaSpinner,
  FaExclamationTriangle,
} from "react-icons/fa";

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_MIME_TYPES = ["text/csv", "application/vnd.ms-excel"];
const MAX_RETRIES = 3;
const RETRY_DELAY = 2000; // 2 seconds

// Add this helper at the top of the component
function hasPremiumAccess(userData) {
  if (!userData) return false;
  if (userData.subscriptionPlan === "gold") return true;
  if (userData.subscriptionPlan === "trial") {
    const trialEnd = userData.trialEndDate?.toDate?.() || userData.trialEndDate;
    return trialEnd && new Date(trialEnd) > new Date();
  }
  return false;
}

const CsvUpload = () => {
  const [file, setFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);
  const [hasAccess, setHasAccess] = useState(false);
  const [isCheckingAccess, setIsCheckingAccess] = useState(true);
  const [validationStatus, setValidationStatus] = useState({
    isValid: false,
    message: "",
    duplicates: [],
    missingValues: {},
    invalidValues: {},
    type: null,
  });
  const [showValidationDetails, setShowValidationDetails] = useState(false);
  const fileInputRef = useRef(null);
  const navigate = useNavigate();
  const OnlineStatus = useOnlineStatus();
  const [retryCount, setRetryCount] = useState(0);
  const [isCancelled, setIsCancelled] = useState(false);
  const abortControllerRef = useRef(null);

  // Sample data structure for CSV file
  const [csvTemplate, setCsvTemplate] = useState(null);

  // Required headers for validation
  const requiredHeaders = [
    "Tenure",
    "PreferredLoginDevice",
    "CityTier",
    "WarehouseToHome",
    "PreferredPaymentMode",
    "Gender",
    "HourSpendOnApp",
    "NumberOfDeviceRegistered",
    "PreferedOrderCat",
    "SatisfactionScore",
    "MaritalStatus",
    "NumberOfAddress",
    "Complain",
    "OrderAmountHikeFromlastYear",
    "CouponUsed",
    "OrderCount",
    "DaySinceLastOrder",
    "CashbackAmount",
  ];

  // Add numeric columns validation
  const numericColumns = [
    "Tenure",
    "CityTier",
    "WarehouseToHome",
    "HourSpendOnApp",
    "NumberOfDeviceRegistered",
    "SatisfactionScore",
    "NumberOfAddress",
    "Complain",
    "OrderAmountHikeFromlastYear",
    "CouponUsed",
    "OrderCount",
    "DaySinceLastOrder",
    "CashbackAmount",
  ];

  // Enhanced file validation
  const validateFile = async (file) => {
    // Reset validation status
    setValidationStatus({
      isValid: false,
      message: "",
      duplicates: [],
      missingValues: {},
      invalidValues: {},
      type: null,
    });

    // Check file size
    if (file.size > MAX_FILE_SIZE) {
      setValidationStatus({
        isValid: false,
        message: `File size exceeds maximum limit of ${MAX_FILE_SIZE / 1024 / 1024}MB`,
        type: "error",
      });
      return false;
    }

    // Check file type
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      setValidationStatus({
        isValid: false,
        message: "Invalid file type. Please upload a CSV file",
        type: "error",
      });
      return false;
    }

    return new Promise((resolve, reject) => {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          try {
            const { data, errors, meta } = results;

            // Check for parsing errors
            if (errors.length > 0) {
              setValidationStatus({
                isValid: false,
                message: "Error parsing CSV file: " + errors[0].message,
                type: "error",
              });
              resolve(false);
              return;
            }

            // Check for empty file
            if (data.length === 0) {
              setValidationStatus({
                isValid: false,
                message: "The CSV file is empty",
                type: "error",
              });
              resolve(false);
              return;
            }

            // Initialize validation tracking
            const duplicateIds = new Set();
            const missingValues = {};
            const invalidValues = {};
            const seenIds = new Set();

            // Validate headers
            const headers = Object.keys(data[0]);
            const missingHeaders = requiredHeaders.filter(
              (header) => !headers.includes(header)
            );

            if (missingHeaders.length > 0) {
              setValidationStatus({
                isValid: false,
                message: `Missing required columns: ${missingHeaders.join(", ")}`,
                type: "error",
              });
              resolve(false);
              return;
            }

            // Validate each row
            data.forEach((row, index) => {
              // Check for duplicate IDs
              const customerId = row.CustomerID;
              if (customerId) {
                if (seenIds.has(customerId)) {
                  duplicateIds.add(customerId);
                } else {
                  seenIds.add(customerId);
                }
              }

              // Check for missing and invalid values
              requiredHeaders.forEach((header) => {
                const value = row[header];
                if (!value || value.toString().trim() === "") {
                  if (!missingValues[header]) {
                    missingValues[header] = [];
                  }
                  missingValues[header].push(index + 1);
                } else if (numericColumns.includes(header)) {
                  // Validate numeric fields
                  const num = parseFloat(value);
                  if (isNaN(num)) {
                    if (!invalidValues[header]) {
                      invalidValues[header] = [];
                    }
                    invalidValues[header].push(index + 1);
                  }
                }
              });
            });

            // Set validation status
            const hasIssues =
              duplicateIds.size > 0 ||
              Object.keys(missingValues).length > 0 ||
              Object.keys(invalidValues).length > 0;

            setValidationStatus({
              isValid: true,
              message: hasIssues
                ? "File validated with warnings"
                : "File is valid",
              type: hasIssues ? "warning" : "success",
              duplicates: Array.from(duplicateIds),
              missingValues,
              invalidValues,
            });

            resolve(true);
          } catch (error) {
            setValidationStatus({
              isValid: false,
              message: `Error validating file: ${error.message}`,
              type: "error",
            });
            resolve(false);
          }
        },
        error: (error) => {
          setValidationStatus({
            isValid: false,
            message: `Error parsing CSV file: ${error.message}`,
            type: "error",
          });
          resolve(false);
        },
      });
    });
  };

  // Check if user has Gold access (either subscription or trial)
  useEffect(() => {
    const checkAccess = async () => {
      setIsCheckingAccess(true);
      try {
        const user = auth.currentUser;
        if (!user) {
          setHasAccess(false);
          navigate("/login");
          return;
        }

        const userDocRef = doc(db, "Users", user.uid);
        const userDoc = await getDoc(userDocRef);

        if (userDoc.exists()) {
          const userData = userDoc.data();
          // Use hasPremiumAccess helper for access check
          if (hasPremiumAccess(userData)) {
            setHasAccess(true);
          } else {
            setHasAccess(false);
            toast.error(
              "Batch predictions are only available for Gold subscribers."
            );
            navigate("/account");
          }
        } else {
          setHasAccess(false);
          toast.error("User profile not found");
          navigate("/login");
        }
      } catch (error) {
        console.error("Error checking access:", error);
        setHasAccess(false);
        toast.error("Error checking access status");
      } finally {
        setIsCheckingAccess(false);
      }
    };

    checkAccess();
  }, [navigate]);

  useEffect(() => {
    // Generate CSV template for download
    const headers = [
      "Tenure",
      "PreferredLoginDevice",
      "CityTier",
      "WarehouseToHome",
      "PreferredPaymentMode",
      "Gender",
      "HourSpendOnApp",
      "NumberOfDeviceRegistered",
      "PreferedOrderCat",
      "SatisfactionScore",
      "MaritalStatus",
      "NumberOfAddress",
      "Complain",
      "OrderAmountHikeFromlastYear",
      "CouponUsed",
      "OrderCount",
      "DaySinceLastOrder",
      "CashbackAmount",
    ];

    const template = headers.join(",");
    setCsvTemplate(template);
  }, []);

  const handleFileChange = async (e) => {
    const selectedFile = e.target.files[0];
    if (!selectedFile) return;

    setError(null);
    const isValid = await validateFile(selectedFile);

    if (isValid) {
      setFile(selectedFile);
      toast.success("File uploaded successfully!");
    } else {
      setFile(null);
      toast.error("Invalid file format or content");
    }
  };

  // Enhanced drag and drop handlers
  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.classList.add("border-[#1d5a7b]", "bg-blue-50", "border-2");
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.classList.remove(
      "border-[#1d5a7b]",
      "bg-blue-50",
      "border-2"
    );
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.classList.remove(
      "border-[#1d5a7b]",
      "bg-blue-50",
      "border-2"
    );

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const droppedFile = e.dataTransfer.files[0];
      const isValid = await validateFile(droppedFile);

      if (isValid) {
        setFile(droppedFile);
        toast.success("File uploaded successfully!");
      } else {
        setFile(null);
        toast.error("Invalid file format or content");
      }
    }
  };

  const handleDownloadTemplate = () => {
    if (!csvTemplate) return;

    const blob = new Blob([csvTemplate], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "customer_churn_template.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast.success("Template downloaded successfully");
  };

  // Enhanced upload function with retry mechanism
  const handleUpload = async () => {
    if (!file) {
      toast.error("Please select a file first");
      return;
    }

    try {
      setIsUploading(true);
      setUploadProgress(0);
      setError(null);

      // Parse CSV file first
      const parseResult = await new Promise((resolve, reject) => {
        Papa.parse(file, {
          header: true,
          skipEmptyLines: true,
          complete: resolve,
          error: reject,
        });
      });

      const csvData = parseResult.data;

      // Process data in batches of 1000
      const BATCH_SIZE = 1000;
      const totalBatches = Math.ceil(csvData.length / BATCH_SIZE);
      let processedRecords = 0;
      let allResults = [];
      let allErrors = [];

      for (let i = 0; i < totalBatches; i++) {
        const start = i * BATCH_SIZE;
        const end = Math.min((i + 1) * BATCH_SIZE, csvData.length);
        const batch = csvData.slice(start, end);

        // Prepare batch data
        const batchData = {
          data: batch.map((row) => {
            // Create a clean copy of the row data
            const cleanData = {};
            const formData = { ...row }; // Keep all original data

            // Process each field
            Object.entries(row).forEach(([key, value]) => {
              // Process for the prediction
              if (key === "CustomerID") {
                cleanData.customerID = value;
              } else if (
                [
                  "Tenure",
                  "CityTier",
                  "WarehouseToHome",
                  "HourSpendOnApp",
                  "NumberOfDeviceRegistered",
                  "SatisfactionScore",
                  "NumberOfAddress",
                  "Complain",
                  "OrderAmountHikeFromlastYear",
                  "CouponUsed",
                  "OrderCount",
                  "DaySinceLastOrder",
                  "CashbackAmount",
                ].includes(key)
              ) {
                const numValue = parseFloat(value) || 0;
                cleanData[key] = numValue;
                formData[key] = numValue;
              } else {
                cleanData[key] = value;
              }
            });

            const processedRow = {
              ...cleanData,
              formData: formData,
            };

            return processedRow;
          }),
          customerIds: batch.map(
            (row) =>
              row.CustomerID ||
              `generated_${Math.random().toString(36).substr(2, 9)}`
          ),
        };

        try {
          // Send batch to API
          const response = await fetch("http://localhost:5000/predict-batch", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(batchData),
          });

          if (!response.ok) {
            throw new Error(`API error: ${response.statusText}`);
          }

          const batchResults = await response.json();
          if (batchResults.error) {
            throw new Error(batchResults.error);
          }

          allResults = [
            ...allResults,
            ...batchResults.predictions.map((pred) => ({
              ...pred,
              formData: batchData.data.find(
                (d) => d.customerID === pred.customerID
              )?.formData,
            })),
          ];

          if (batchResults.errors) {
            allErrors = [...allErrors, ...batchResults.errors];
          }

          // Update progress
          processedRecords += batch.length;
          const progress = Math.round(
            (processedRecords / csvData.length) * 100
          );
          setUploadProgress(progress);
        } catch (error) {
          console.error("Batch processing error:", error);
          toast.error(`Error processing batch ${i + 1}: ${error.message}`);
          throw error;
        }
      }

      // Set final results
      setResults({
        predictions: allResults,
        errors: allErrors,
        summary: {
          total: csvData.length,
          successful: allResults.length,
          failed: allErrors.length,
        },
      });

      setUploadProgress(100);
      toast.success(`Successfully processed ${processedRecords} records`);
    } catch (error) {
      console.error("Upload error:", error);
      setError(error.message);
      toast.error(`Error: ${error.message}`);
    } finally {
      setIsUploading(false);
    }
  };

  // Cancel upload function
  const handleCancelUpload = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setIsCancelled(true);
    setIsUploading(false);
    setUploadProgress(0);
  };

  // Add clear file handler
  const handleClearFile = () => {
    setFile(null);
    setValidationStatus({
      isValid: false,
      message: "",
      duplicates: [],
      missingValues: {},
      invalidValues: {},
      type: null,
    });
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    toast.info("File cleared");
  };

  // Save to Firestore with retry
  const saveToFirestore = async (result, fileName, recordCount) => {
    const user = auth.currentUser;
    if (!user) throw new Error("User not authenticated");

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        await addDoc(collection(db, "Users", user.uid, "csvPredictions"), {
          timestamp: serverTimestamp(),
          fileName,
          recordCount,
          results: result,
        });
        return;
      } catch (error) {
        if (attempt === MAX_RETRIES - 1) throw error;
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY));
      }
    }
  };

  const renderValidationStatus = () => (
    <div className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-sm font-medium text-gray-700">
          File Validation Status
        </h4>
        <button
          onClick={() => setShowValidationDetails(!showValidationDetails)}
          className="text-sm text-blue-600 hover:text-blue-800"
        >
          {showValidationDetails ? "Hide Details" : "Show Details"}
        </button>
      </div>

      {showValidationDetails && (
        <div className="space-y-2">
          <div className="flex items-center">
            {validationStatus.type === null ? (
              <FaInfoCircle className="text-gray-400 w-5 h-5 mr-2" />
            ) : validationStatus.type === "success" ? (
              <FaCheckCircle className="text-green-500 w-5 h-5 mr-2" />
            ) : (
              <FaTimesCircle className="text-red-500 w-5 h-5 mr-2" />
            )}
            <span className="text-sm text-gray-600">
              {validationStatus.message}
            </span>
          </div>
        </div>
      )}
    </div>
  );

  if (OnlineStatus === false) {
    return (
      <div className="flex justify-center items-center h-screen">
        <div className="text-center p-8 bg-red-50 rounded-lg shadow-md">
          <h1 className="text-xl text-red-600 font-semibold">
            You are offline! Please check your internet connection.
          </h1>
        </div>
      </div>
    );
  }

  if (isCheckingAccess) {
    return (
      <div className="min-h-screen pt-48 flex flex-col items-center justify-center">
        <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-[#1d5a7b]"></div>
        <p className="mt-4 text-lg text-gray-600">Checking access status...</p>
      </div>
    );
  }

  if (!hasAccess) {
    return (
      <div className="min-h-screen pt-48 flex flex-col items-center justify-center px-4">
        <div className="bg-white shadow-xl rounded-lg p-8 max-w-md w-full text-center">
          <FaCrown className="text-yellow-500 text-6xl mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-[#1d5a7b] mb-4">
            Gold Subscription Required
          </h2>
          <p className="text-gray-600 mb-6">
            You need a Gold subscription to access CSV file uploads.
          </p>
          <button
            onClick={() => navigate("/subscription-plans")}
            className="bg-[#1d5a7b] text-white rounded-md py-2 px-6 font-medium hover:bg-[#164e68] transition-colors"
          >
            View Subscription Plans
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="sticky top-0 z-50 bg-white border-b border-gray-200 shadow-sm"></div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="bg-white shadow-xl rounded-lg overflow-hidden">
          {!results ? (
            <div className="p-6">
              <div className="mb-8 p-6 bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg border border-blue-200">
                <h3 className="text-lg font-semibold text-blue-800 mb-4 flex items-center">
                  <FaInfoCircle className="mr-2" />
                  Instructions
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <h4 className="font-medium text-blue-700 mb-2">
                      Requirements
                    </h4>
                    <ul className="list-disc pl-5 space-y-1 text-blue-600">
                      <li>CSV file format only</li>
                      <li>Maximum file size: 5MB</li>
                      <li>All required columns must be present</li>
                      <li>One row per customer</li>
                    </ul>
                  </div>
                  <div>
                    <h4 className="font-medium text-blue-700 mb-2">
                      Quick Start
                    </h4>
                    <ol className="list-decimal pl-5 space-y-1 text-blue-600">
                      <li>Download our template</li>
                      <li>Fill in your data</li>
                      <li>Upload the file</li>
                      <li>Review predictions</li>
                    </ol>
                  </div>
                </div>
                <button
                  onClick={handleDownloadTemplate}
                  className="mt-4 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-full shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  <FaFileDownload className="mr-2" />
                  Download Template
                </button>
              </div>

              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Upload CSV File
                </label>
                <div
                  className={`mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-dashed rounded-lg transition-all duration-200 ${
                    file
                      ? "border-green-300 bg-green-50"
                      : "border-gray-300 hover:border-[#1d5a7b] hover:bg-blue-50"
                  }`}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() =>
                    fileInputRef.current && fileInputRef.current.click()
                  }
                >
                  <div className="space-y-2 text-center">
                    {file ? (
                      <>
                        <FaCheckCircle className="mx-auto h-12 w-12 text-green-500" />
                        <p className="text-sm text-green-600">
                          File ready for upload
                        </p>
                      </>
                    ) : (
                      <>
                        <FaFileUpload className="mx-auto h-12 w-12 text-gray-400" />
                        <p className="text-sm text-gray-600">
                          Drag and drop your CSV file here, or click to browse
                        </p>
                      </>
                    )}
                    <input
                      type="file"
                      className="sr-only"
                      accept=".csv"
                      ref={fileInputRef}
                      onChange={handleFileChange}
                      disabled={isUploading}
                    />
                    <p className="text-xs text-gray-500">CSV up to 5MB</p>
                  </div>
                </div>
                {file && (
                  <div className="mt-2 flex items-center justify-between text-sm text-gray-600">
                    <div className="flex items-center">
                      <FaCheckCircle className="text-green-500 mr-2" />
                      Selected file: {file.name}
                    </div>
                    <button
                      onClick={handleClearFile}
                      className="ml-4 px-3 py-1 text-red-600 hover:text-red-800 hover:bg-red-50 rounded-md transition-colors duration-200 flex items-center"
                    >
                      <FaTimesCircle className="mr-1" />
                      Clear
                    </button>
                  </div>
                )}
              </div>

              {isUploading && (
                <div className="mb-6">
                  <div className="relative pt-1">
                    <div className="flex mb-2 items-center justify-between">
                      <div>
                        <span className="text-xs font-semibold inline-block py-1 px-2 uppercase rounded-full text-blue-600 bg-blue-200">
                          Processing
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-xs font-semibold inline-block text-blue-600">
                          {uploadProgress}%
                        </span>
                      </div>
                    </div>
                    <div className="overflow-hidden h-2 mb-4 text-xs flex rounded bg-blue-200">
                      <div
                        style={{ width: `${uploadProgress}%` }}
                        className="shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center bg-blue-500 transition-all duration-500"
                      ></div>
                    </div>
                  </div>
                </div>
              )}

              {error && (
                <div className="mb-6 p-4 bg-red-50 rounded-lg border border-red-200">
                  <div className="flex items-center">
                    <FaTimesCircle className="text-red-500 w-5 h-5 mr-2" />
                    <p className="text-sm text-red-600">{error}</p>
                  </div>
                </div>
              )}

              <div className="flex justify-end">
                <button
                  type="button"
                  className={`inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-full shadow-sm text-white ${
                    !file || isUploading
                      ? "bg-gray-400 cursor-not-allowed"
                      : "bg-[#1d5a7b] hover:bg-[#164e68] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#1d5a7b]"
                  }`}
                  onClick={handleUpload}
                  disabled={!file || isUploading}
                >
                  {isUploading ? (
                    <>
                      <FaSpinner className="animate-spin -ml-1 mr-2 h-5 w-5" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <FaFileUpload className="mr-2" />
                      Upload and Process
                    </>
                  )}
                </button>
              </div>
            </div>
          ) : (
            <CsvResults results={results} fileName={file?.name} />
          )}
        </div>
      </div>
    </div>
  );
};

export default CsvUpload;
