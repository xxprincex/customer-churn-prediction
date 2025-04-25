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
  setDoc,
  increment,
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
    imputationStats: null,
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

  const validateDataTypes = (data) => {
    const errors = [];

    data.forEach((row, index) => {
      // Validate numeric fields
      numericColumns.forEach((field) => {
        const value = row[field];
        if (
          value === undefined ||
          value === null ||
          value === "" ||
          isNaN(parseFloat(value))
        ) {
          errors.push(`Row ${index + 1}: Invalid numeric value for ${field}`);
        }
      });

      // Validate required fields are not empty
      requiredHeaders.forEach((field) => {
        const value = row[field];
        if (!value || value.toString().trim() === "") {
          errors.push(`Row ${index + 1}: Missing required value for ${field}`);
        }
      });

      // Validate specific field formats
      if (row.CityTier && ![1, 2, 3, "1", "2", "3"].includes(row.CityTier)) {
        errors.push(`Row ${index + 1}: CityTier must be 1, 2, or 3`);
      }

      if (
        row.SatisfactionScore &&
        ![1, 2, 3, 4, 5, "1", "2", "3", "4", "5"].includes(
          row.SatisfactionScore
        )
      ) {
        errors.push(
          `Row ${index + 1}: SatisfactionScore must be between 1 and 5`
        );
      }

      if (row.Complain && !["0", "1", 0, 1].includes(row.Complain)) {
        errors.push(`Row ${index + 1}: Complain must be 0 or 1`);
      }
    });

    return errors;
  };

  // Enhanced file validation
  const validateFile = (file) => {
    return new Promise((resolve, reject) => {
      if (!file) {
        setValidationStatus({
          isValid: false,
          type: "error",
          message: "Please select a file to upload",
        });
        reject(new Error("No file selected"));
        return;
      }

      // Check file size (5MB limit)
      if (file.size > 5 * 1024 * 1024) {
        setValidationStatus({
          isValid: false,
          type: "error",
          message: "File size exceeds 5MB limit",
        });
        reject(new Error("File too large"));
        return;
      }

      // Check file type
      if (file.type !== "text/csv" && !file.name.endsWith(".csv")) {
        setValidationStatus({
          isValid: false,
          type: "error",
          message: "Please upload a valid CSV file",
        });
        reject(new Error("Invalid file type"));
        return;
      }

      // Column name mapping for common variations
      const columnMapping = {
        customerid: "CustomerID",
        tenure: "Tenure",
        preferredlogindevice: "PreferredLoginDevice",
        citytier: "CityTier",
        warehousetohome: "WarehouseToHome",
        preferredpaymentmode: "PreferredPaymentMode",
        gender: "Gender",
        hourspendonapp: "HourSpendOnApp",
        numberofdeviceregistered: "NumberOfDeviceRegistered",
        preferedordercat: "PreferedOrderCat",
        satisfactionscore: "SatisfactionScore",
        maritalstatus: "MaritalStatus",
        numberofaddress: "NumberOfAddress",
        complain: "Complain",
        orderamounthikefromlastyear: "OrderAmountHikeFromlastYear",
        couponused: "CouponUsed",
        ordercount: "OrderCount",
        daysincelastorder: "DaySinceLastOrder",
        cashbackamount: "CashbackAmount",
      };

      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          const headers = results.meta.fields || [];

          // Normalize headers by removing spaces and converting to lowercase
          const normalizedHeaders = headers.map((h) =>
            h.replace(/\s+/g, "").toLowerCase()
          );

          // Check for missing required columns with better error handling
          const missingColumns = [];
          const foundColumns = [];

          Object.keys(columnMapping).forEach((requiredCol) => {
            if (
              !normalizedHeaders.some((header) =>
                header.includes(requiredCol.toLowerCase())
              )
            ) {
              missingColumns.push(columnMapping[requiredCol]);
            } else {
              foundColumns.push(columnMapping[requiredCol]);
            }
          });

          if (missingColumns.length > 0) {
            const errorMessage = {
              isValid: false,
              type: "error",
              message: "Missing required columns",
              details: {
                missing: missingColumns,
                found: foundColumns,
                original: headers,
              },
            };
            setValidationStatus(errorMessage);

            // Show a more helpful toast message
            toast.error(
              <div>
                <p>Your CSV file is missing some required columns.</p>
                <p>Missing: {missingColumns.join(", ")}</p>
                <p className="text-sm mt-2">
                  Tip: Download our template for the correct format
                </p>
              </div>,
              { autoClose: 8000 }
            );

            reject(new Error("Missing required columns"));
            return;
          }

          // If we get here, validation passed
          setValidationStatus({
            isValid: true,
            type: "success",
            message: "File validation successful",
            details: {
              rowCount: results.data.length,
              columnCount: headers.length,
            },
          });

          resolve(true);
        },
        error: (error) => {
          setValidationStatus({
            isValid: false,
            type: "error",
            message: "Error parsing CSV file: " + error.message,
          });
          reject(error);
        },
      });
    });
  };

  // Enhanced missing value handler
  const handleMissingValues = (data) => {
    const imputationStats = {};
    const processedData = data.map((row) => {
      const newRow = { ...row };

      // Handle numeric fields with default values
      const numericDefaults = {
        Tenure: 0,
        CityTier: 2,
        WarehouseToHome: 0,
        HourSpendOnApp: 0,
        NumberOfDeviceRegistered: 1,
        SatisfactionScore: 3,
        NumberOfAddress: 1,
        Complain: 0,
        OrderAmountHikeFromlastYear: 0,
        CouponUsed: 0,
        OrderCount: 0,
        DaySinceLastOrder: 0,
        CashbackAmount: 0,
      };

      Object.entries(numericDefaults).forEach(([field, defaultValue]) => {
        if (!newRow[field] || isNaN(parseFloat(newRow[field]))) {
          newRow[field] = defaultValue;
          incrementImputationStat(imputationStats, field);
        } else {
          newRow[field] = parseFloat(newRow[field]);
        }
      });

      // Handle categorical fields with default values
      const categoricalDefaults = {
        PreferredLoginDevice: "Phone",
        PreferredPaymentMode: "Debit Card",
        Gender: "Unknown",
        PreferedOrderCat: "Grocery",
        MaritalStatus: "Single",
      };

      Object.entries(categoricalDefaults).forEach(([field, defaultValue]) => {
        if (!newRow[field] || newRow[field].trim() === "") {
          newRow[field] = defaultValue;
          incrementImputationStat(imputationStats, field);
        }
      });

      return newRow;
    });

    return { processedData, imputationStats };
  };

  const incrementImputationStat = (stats, field) => {
    stats[field] = (stats[field] || 0) + 1;
  };

  const formatImputationMessage = (imputationStats) => {
    const totalImputations = Object.values(imputationStats).reduce(
      (a, b) => a + b,
      0
    );
    if (totalImputations === 0) return "";

    const details = Object.entries(imputationStats)
      .map(([field, count]) => `${field}: ${count}`)
      .join(", ");

    return `Missing values were filled for: ${details}`;
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
      "CustomerID",
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

    // Add a sample row with example data
    const sampleData = [
      "CUST001",
      "12",
      "Phone",
      "1",
      "5",
      "Debit Card",
      "Male",
      "2.5",
      "2",
      "Grocery",
      "4",
      "Single",
      "2",
      "0",
      "10.5",
      "2",
      "5",
      "3",
      "100",
    ];

    const template = headers.join(",") + "\n" + sampleData.join(",");
    setCsvTemplate(template);
  }, []);

  const handleFileChange = async (e) => {
    const selectedFile = e.target.files[0];
    if (!selectedFile) return;

    setError(null);
    setValidationStatus({
      isValid: false,
      message: "",
      duplicates: [],
      missingValues: {},
      invalidValues: {},
      type: null,
      imputationStats: null,
    });
    setResults(null);
    setUploadProgress(0);

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

  // Modify the handleUpload function to use the missing value handler
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

      let csvData = parseResult.data;
      let processingErrors = [];

      // Handle missing values and validate data before processing
      const { processedData, imputationStats } = handleMissingValues(csvData);
      csvData = processedData;

      // Validate data types and collect errors
      const validationErrors = validateDataTypes(csvData);
      if (validationErrors.length > 0) {
        processingErrors.push(
          ...validationErrors.map((error) => ({
            type: "Validation Error",
            message: error,
            field: error.split(":")[1]?.split(" ")[2], // Extract field name from error message
          }))
        );
      }

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

        // Prepare batch data with enhanced error tracking
        const batchData = {
          data: batch
            .map((row, index) => {
              try {
                // Create a clean copy of the row data
                const cleanData = {};
                const formData = { ...row };

                // Process each field with detailed error tracking
                Object.entries(row).forEach(([key, value]) => {
                  try {
                    if (key === "CustomerID") {
                      cleanData.customerID = value;
                    } else if (numericColumns.includes(key)) {
                      const numValue = parseFloat(value);
                      if (isNaN(numValue)) {
                        throw new Error(
                          `Invalid numeric value for ${key}: ${value}`
                        );
                      }
                      cleanData[key] = numValue;
                      formData[key] = numValue;
                    } else {
                      cleanData[key] = value;
                    }
                  } catch (fieldError) {
                    processingErrors.push({
                      type: "Data Type Error",
                      message: fieldError.message,
                      row: start + index + 1,
                      field: key,
                      value: value,
                    });
                  }
                });

                return {
                  ...cleanData,
                  formData: formData,
                };
              } catch (rowError) {
                processingErrors.push({
                  type: "Row Processing Error",
                  message: rowError.message,
                  row: start + index + 1,
                });
                return null;
              }
            })
            .filter(Boolean), // Remove failed rows
          customerIds: batch.map((row, index) => {
            const id =
              row.CustomerID ||
              `generated_${Math.random().toString(36).substr(2, 9)}`;
            if (!row.CustomerID) {
              processingErrors.push({
                type: "Missing ID",
                message: "Generated temporary ID for missing CustomerID",
                row: start + index + 1,
              });
            }
            return id;
          }),
        };

        try {
          // Send batch to API with timeout handling
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

          const response = await fetch("http://localhost:5000/predict-batch", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(batchData),
            signal: controller.signal,
          });

          clearTimeout(timeoutId);

          if (!response.ok) {
            throw new Error(`API error: ${response.statusText}`);
          }

          const batchResults = await response.json();
          if (batchResults.error) {
            throw new Error(batchResults.error);
          }

          // Process successful predictions
          allResults = [
            ...allResults,
            ...batchResults.predictions.map((pred) => ({
              ...pred,
              formData: batchData.data.find(
                (d) => d.customerID === pred.customerID
              )?.formData,
            })),
          ];

          // Collect API-reported errors
          if (batchResults.errors) {
            allErrors = [
              ...allErrors,
              ...batchResults.errors.map((error) => ({
                type: "API Error",
                ...error,
              })),
            ];
          }

          // Update progress
          processedRecords += batch.length;
          const progress = Math.round(
            (processedRecords / csvData.length) * 100
          );
          setUploadProgress(progress);
        } catch (error) {
          console.error("Batch processing error:", error);

          // Handle different types of errors
          if (error.name === "AbortError") {
            processingErrors.push({
              type: "Timeout Error",
              message: `Batch ${i + 1} processing timed out`,
              batchIndex: i,
            });
          } else {
            processingErrors.push({
              type: "API Error",
              message: error.message,
              batchIndex: i,
            });
          }

          // Continue with next batch despite errors
          continue;
        }
      }

      // Combine all errors
      const finalErrors = [...processingErrors, ...allErrors];

      // Prepare final results with enhanced error reporting
      const finalResults = {
        predictions: allResults,
        errors: finalErrors,
        summary: {
          total: csvData.length,
          successful: allResults.length,
          failed: csvData.length - allResults.length,
          errorTypes: finalErrors.reduce((acc, error) => {
            acc[error.type] = (acc[error.type] || 0) + 1;
            return acc;
          }, {}),
        },
      };

      // Set results for display
      setResults(finalResults);
      setUploadProgress(100);

      // Show appropriate toast message based on success rate
      const successRate = (allResults.length / csvData.length) * 100;
      if (successRate === 100) {
        toast.success(`Successfully processed all ${processedRecords} records`);
      } else if (successRate > 50) {
        toast.warning(
          `Processed ${allResults.length} out of ${csvData.length} records successfully`
        );
      } else {
        toast.error(
          `High failure rate: Only ${allResults.length} out of ${csvData.length} records processed successfully`
        );
      }
    } catch (error) {
      console.error("Upload error:", error);
      setError(error.message);
      toast.error(`Error: ${error.message}`);
    } finally {
      setIsUploading(false);
    }
  };

  // Update saveToFirestore function to handle large datasets
  const saveToFirestore = async (result, fileName, recordCount) => {
    const user = auth.currentUser;
    if (!user) throw new Error("User not authenticated");

    const CHUNK_SIZE = 100; // Maximum number of predictions per chunk
    const predictions = result.predictions;
    const chunks = [];

    // Validate predictions array
    if (!Array.isArray(predictions) || predictions.length === 0) {
      throw new Error("No valid predictions to save");
    }

    // Clean and validate predictions before chunking
    const cleanedPredictions = predictions
      .map((pred) => {
        // Ensure each prediction has required fields
        if (!pred || typeof pred !== "object") {
          return null;
        }

        // Clean the prediction object by removing undefined/null values
        const cleaned = Object.entries(pred).reduce((acc, [key, value]) => {
          if (value != null) {
            acc[key] = value;
          }
          return acc;
        }, {});

        // Ensure the cleaned object has at least some data
        return Object.keys(cleaned).length > 0 ? cleaned : null;
      })
      .filter(Boolean); // Remove any null entries

    if (cleanedPredictions.length === 0) {
      throw new Error("No valid prediction data to save");
    }

    // Split valid predictions into chunks
    for (let i = 0; i < cleanedPredictions.length; i += CHUNK_SIZE) {
      const chunk = cleanedPredictions.slice(i, i + CHUNK_SIZE);
      // Only add non-empty chunks
      if (chunk && chunk.length > 0) {
        chunks.push(chunk);
      }
    }

    try {
      // Create main document with summary data
      const mainDocRef = await addDoc(
        collection(db, "Users", user.uid, "batchPredictions"),
        {
          timestamp: serverTimestamp(),
          fileName: fileName || "Untitled Batch",
          recordCount: cleanedPredictions.length,
          summary: {
            total: cleanedPredictions.length,
            successful: cleanedPredictions.length,
            failed: recordCount - cleanedPredictions.length,
            ...result.summary,
          },
          totalChunks: chunks.length,
          errors: Array.isArray(result.errors) ? result.errors : [],
        }
      );

      // Save chunks with retry logic
      const chunksCollection = collection(
        db,
        "Users",
        user.uid,
        "batchPredictions",
        mainDocRef.id,
        "chunks"
      );

      // Save chunks in parallel with retry logic
      await Promise.all(
        chunks.map(async (chunk, index) => {
          // Skip empty chunks
          if (!chunk || chunk.length === 0) return;

          const chunkData = {
            predictions: chunk,
            chunkIndex: index,
            count: chunk.length,
          };

          // Validate chunk data before saving
          if (!chunkData.predictions || chunkData.predictions.length === 0) {
            console.error(`Skipping empty chunk ${index}`);
            return;
          }

          for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
            try {
              await setDoc(doc(chunksCollection, `chunk_${index}`), chunkData);
              break;
            } catch (error) {
              console.error(
                `Error saving chunk ${index}, attempt ${attempt + 1}:`,
                error
              );
              if (attempt === MAX_RETRIES - 1) throw error;
              await new Promise((resolve) =>
                setTimeout(resolve, RETRY_DELAY * (attempt + 1))
              );
            }
          }
        })
      );

      return mainDocRef.id;
    } catch (error) {
      console.error("Error saving to Firestore:", error);
      throw error;
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
      imputationStats: null,
    });
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    toast.info("File cleared");
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

      <div className="flex items-center">
        {validationStatus.type === "success" ? (
          <FaCheckCircle className="text-green-500 w-5 h-5 mr-2" />
        ) : validationStatus.type === "error" ? (
          <FaTimesCircle className="text-red-500 w-5 h-5 mr-2" />
        ) : (
          <FaInfoCircle className="text-blue-500 w-5 h-5 mr-2" />
        )}
        <span className="text-sm text-gray-600">
          {validationStatus.message}
        </span>
      </div>

      {showValidationDetails && validationStatus.details && (
        <div className="mt-4 space-y-3">
          {validationStatus.details.missing &&
            validationStatus.details.missing.length > 0 && (
              <div className="bg-red-50 p-3 rounded-md">
                <h5 className="text-sm font-medium text-red-800 mb-2">
                  Missing Columns:
                </h5>
                <ul className="list-disc pl-5 space-y-1">
                  {validationStatus.details.missing.map((col, idx) => (
                    <li key={idx} className="text-sm text-red-600">
                      {col}
                    </li>
                  ))}
                </ul>
              </div>
            )}

          {validationStatus.details.found &&
            validationStatus.details.found.length > 0 && (
              <div className="bg-green-50 p-3 rounded-md">
                <h5 className="text-sm font-medium text-green-800 mb-2">
                  Found Columns:
                </h5>
                <ul className="list-disc pl-5 space-y-1">
                  {validationStatus.details.found.map((col, idx) => (
                    <li key={idx} className="text-sm text-green-600">
                      {col}
                    </li>
                  ))}
                </ul>
              </div>
            )}

          {validationStatus.details.rowCount && (
            <div className="text-sm text-gray-600">
              <p>Total Rows: {validationStatus.details.rowCount}</p>
              <p>Total Columns: {validationStatus.details.columnCount}</p>
            </div>
          )}
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
    <div className="min-h-screen bg-gray-50 pt-8 pb-12">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
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
                  className={`mt-1 flex flex-col justify-center items-center px-6 pt-5 pb-6 border-2 border-dashed rounded-lg transition-all duration-200 cursor-pointer ${
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
                  <div className="text-center">
                    {file ? (
                      <>
                        <FaCheckCircle className="mx-auto h-12 w-12 text-green-500" />
                        <p className="mt-2 text-sm text-green-600">
                          File ready for upload
                        </p>
                      </>
                    ) : (
                      <>
                        <FaFileUpload className="mx-auto h-12 w-12 text-gray-400" />
                        <p className="mt-2 text-sm text-gray-600">
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
                    <p className="mt-1 text-xs text-gray-500">CSV up to 5MB</p>
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

              {validationStatus.message && renderValidationStatus()}

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
