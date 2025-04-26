// API Configuration
const config = {
  // Use environment variable if available, otherwise use the default backend URL
  API_URL:
    process.env.REACT_APP_API_URL ||
    "https://customer-churn-prediction-pxq8.onrender.com",
};

export default config;
