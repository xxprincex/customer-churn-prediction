import React from "react";
import { FaCheckCircle, FaExclamationTriangle } from "react-icons/fa";
import { MdError } from "react-icons/md";

const Result = ({ prediction, formData, error }) => {
  if (error) {
    return (
      <div className="mt-8 p-6 bg-red-50 rounded-lg">
        <div className="flex items-center justify-center text-red-600 mb-4">
          <MdError className="text-4xl" />
        </div>
        <p className="text-center text-red-600 font-medium">{error}</p>
      </div>
    );
  }

  if (!prediction) return null;

  // Step 1: Extract prediction values
  const churnProbability = prediction.churn_probability
    ? (prediction.churn_probability * 100).toFixed(1)
    : 0;
  const stayProbability = prediction.stay_probability
    ? (prediction.stay_probability * 100).toFixed(1)
    : 0;
  const willChurn = prediction.prediction === 1;
  const riskFactors = prediction.risk_factors || [];
  const confidenceScore = prediction.confidence_score || 0;

  // Step 2: Determine risk level and color scheme
  const getRiskLevel = (probability) => {
    const prob = parseFloat(probability);
    if (prob > 70) return { level: "High", color: "red" };
    if (prob > 30) return { level: "Medium", color: "yellow" };
    return { level: "Low", color: "green" };
  };

  const riskInfo = getRiskLevel(churnProbability);

  // Step 3: Generate action items based on risk level and factors
  const getActionItems = () => {
    if (willChurn) {
      const items = [
        {
          icon: "🚨",
          text: "Immediate intervention required",
          priority: "high",
        },
      ];

      // Add specific actions based on risk factors
      if (riskFactors.includes("Low satisfaction score")) {
        items.push({
          icon: "📞",
          text: "Schedule urgent satisfaction review call",
          priority: "high",
        });
      }

      if (parseInt(formData.OrderCount) <= 2) {
        items.push({
          icon: "🎁",
          text: `Special first-time customer retention offer`,
          priority: "high",
        });
      }

      items.push({
        icon: "💰",
        text: `Prepare retention offer with ${Math.round(formData.CashbackAmount * 2)} bonus points`,
        priority: "medium",
      });

      if (formData.CouponUsed === "0") {
        items.push({
          icon: "🏷️",
          text: "Introduce personalized coupon program",
          priority: "medium",
        });
      }

      return items;
    }

    // Actions for low-risk customers
    return [
      {
        icon: "🌟",
        text: "Maintain service quality",
        priority: "medium",
      },
      {
        icon: "📈",
        text: "Monitor satisfaction trends",
        priority: "low",
      },
      {
        icon: "🤝",
        text: "Consider loyalty program enrollment",
        priority: "medium",
      },
      {
        icon: "💡",
        text: "Explore upsell opportunities",
        priority: "low",
      },
    ];
  };

  // Get behavioral analysis based on customer data
  const getBehavioralAnalysis = () => {
    const analysis = [];

    // Tenure Analysis
    if (parseInt(formData.Tenure) > 12) {
      analysis.push(
        `This is a long-term customer (${formData.Tenure} months) `
      );
    } else if (parseInt(formData.Tenure) > 6) {
      analysis.push(
        `This is a moderately established customer (${formData.Tenure} months) `
      );
    } else if (parseInt(formData.Tenure) === 0) {
      analysis.push("This is a brand new customer ");
    } else {
      analysis.push(
        `This is a relatively new customer (${formData.Tenure} months) `
      );
    }

    // Satisfaction and Engagement Analysis
    if (parseInt(formData.SatisfactionScore) >= 4) {
      analysis.push(
        `showing high satisfaction (${formData.SatisfactionScore}/5) `
      );
    } else if (parseInt(formData.SatisfactionScore) <= 2) {
      analysis.push(
        `with concerning low satisfaction (${formData.SatisfactionScore}/5) `
      );
    }

    // Order Behavior
    if (parseInt(formData.OrderCount) > 5) {
      analysis.push(
        `and strong ordering pattern (${formData.OrderCount} orders). `
      );
    } else if (parseInt(formData.OrderCount) <= 2) {
      analysis.push(
        `with limited ordering history (${formData.OrderCount} orders). `
      );
    }

    // Recent Activity
    if (parseInt(formData.DaySinceLastOrder) === 0) {
      analysis.push(
        "The customer has ordered today, showing active engagement. "
      );
    } else if (parseInt(formData.DaySinceLastOrder) <= 7) {
      analysis.push(
        "The customer has ordered within the last week, indicating recent activity. "
      );
    } else if (parseInt(formData.DaySinceLastOrder) > 30) {
      analysis.push(
        `No orders in ${formData.DaySinceLastOrder} days, suggesting declining engagement. `
      );
    }

    // Platform Engagement
    const deviceCount = parseInt(formData.NumberOfDeviceRegistered);
    if (deviceCount >= 3) {
      analysis.push(
        `Strong platform presence with ${deviceCount} registered devices `
      );
    }

    // Growth Indicators
    if (parseFloat(formData.OrderAmountHikeFromlastYear) > 10) {
      analysis.push(
        `and showing positive growth in order value (${formData.OrderAmountHikeFromlastYear}% increase). `
      );
    }

    // Complaint Status
    if (formData.Complain === "1") {
      analysis.push(
        "However, there are unresolved complaints that need immediate attention."
      );
    }

    // Prediction Summary
    if (prediction.prediction === 1) {
      analysis.push(
        `\n\nDespite ${
          parseInt(formData.DaySinceLastOrder) <= 7
            ? "recent activity"
            : "some engagement"
        }${deviceCount >= 3 ? " and multiple device usage" : ""}, ${
          parseInt(formData.Tenure) === 0
            ? "being a new customer with"
            : "the combination of"
        } ${
          parseInt(formData.SatisfactionScore) <= 2
            ? "low satisfaction"
            : "current behavior patterns"
        }${
          parseInt(formData.OrderCount) <= 2
            ? " and minimal ordering history"
            : ""
        } indicates a high risk of churn requiring immediate attention.`
      );
    } else {
      analysis.push(
        `\n\nThe combination of ${
          parseInt(formData.SatisfactionScore) >= 4
            ? "high satisfaction"
            : "stable engagement"
        }${
          parseInt(formData.DaySinceLastOrder) <= 7 ? ", recent activity" : ""
        }${
          deviceCount >= 3 ? ", and multi-device usage" : ""
        } suggests a healthy customer relationship with good retention prospects.`
      );
    }

    return analysis.join("");
  };

  const getIndicators = (formData) => {
    const positiveIndicators = [];
    const negativeIndicators = [];

    // Analyze tenure
    if (parseInt(formData.Tenure) > 12) {
      positiveIndicators.push("Long-term customer relationship");
    } else if (parseInt(formData.Tenure) < 3) {
      negativeIndicators.push("Very short tenure");
    }

    // Analyze satisfaction
    if (parseInt(formData.SatisfactionScore) >= 4) {
      positiveIndicators.push("High satisfaction score");
    } else if (parseInt(formData.SatisfactionScore) <= 2) {
      negativeIndicators.push("Low satisfaction score");
    }

    // Analyze order count
    if (parseInt(formData.OrderCount) > 5) {
      positiveIndicators.push("Regular ordering pattern");
    } else if (parseInt(formData.OrderCount) <= 2) {
      negativeIndicators.push("Low order count");
    }

    // Analyze complaints
    if (formData.Complain === "1") {
      negativeIndicators.push("Has filed complaints");
    } else {
      positiveIndicators.push("No complaints filed");
    }

    // Analyze order amount hike
    if (parseFloat(formData.OrderAmountHikeFromlastYear) > 15) {
      positiveIndicators.push("Strong order value growth");
    } else if (parseFloat(formData.OrderAmountHikeFromlastYear) < 10) {
      negativeIndicators.push("Low order value growth");
    }

    // Analyze device registration
    if (parseInt(formData.NumberOfDeviceRegistered) >= 3) {
      positiveIndicators.push("Multi-device engagement");
    }

    // Analyze days since last order
    if (parseInt(formData.DaySinceLastOrder) > 30) {
      negativeIndicators.push("Long time since last order");
    }

    return { positiveIndicators, negativeIndicators };
  };

  const getRecommendations = (prediction, formData) => {
    const recommendations = [];

    if (prediction.prediction === 1) {
      // High risk recommendations
      recommendations.push("Immediate customer outreach required");
      if (formData.Complain === "1") {
        recommendations.push("Priority complaint resolution");
      }
      recommendations.push("Offer personalized retention promotions");
      recommendations.push("Conduct satisfaction survey");
    } else {
      // Low risk recommendations
      recommendations.push("Maintain service quality");
      recommendations.push("Consider loyalty program enrollment");
      if (parseInt(formData.HourSpendOnApp) < 2) {
        recommendations.push("Encourage app engagement");
      }
      recommendations.push("Monitor satisfaction trends");
    }

    return recommendations;
  };

  const { positiveIndicators, negativeIndicators } = getIndicators(formData);
  const recommendations = getRecommendations(prediction, formData);

  return (
    <div className="mt-8 p-6 bg-white rounded-lg shadow-lg">
      {/* Prediction Header */}
      <div className="flex flex-col items-center justify-center mb-6">
        <div
          className={`text-5xl mb-4 ${willChurn ? "text-red-500" : "text-green-500"}`}
        >
          {willChurn ? <FaExclamationTriangle /> : <FaCheckCircle />}
        </div>
        <h2
          className={`text-2xl font-bold mb-2 ${willChurn ? "text-red-600" : "text-green-600"}`}
        >
          {willChurn ? "High Risk of Churn" : "Likely to Stay"}
        </h2>
        <div className="text-gray-600 text-center">
          <p className="text-lg">
            Confidence Score: {prediction.confidence_score}%
          </p>
          <p className="text-sm mt-1">
            Churn Probability: {Math.round(prediction.churn_probability * 100)}%
            | Stay Probability: {Math.round(prediction.stay_probability * 100)}%
          </p>
        </div>
      </div>

      {/* Customer Behavior Analysis */}
      <div
        className={`p-4 rounded-lg mb-6 ${willChurn ? "bg-red-50" : "bg-green-50"}`}
      >
        <h3 className="text-lg font-semibold text-gray-800 mb-2">
          Customer Behavior Analysis
        </h3>
        <p
          className={`text-sm leading-relaxed ${willChurn ? "text-red-700" : "text-green-700"}`}
        >
          {getBehavioralAnalysis()}
        </p>
      </div>

      {/* Analysis Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Key Indicators */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-800">
            Key Indicators
          </h3>

          {positiveIndicators.length > 0 && (
            <div className="ml-4">
              <h4 className="text-green-600 font-medium mb-2">
                Positive Signals:
              </h4>
              <ul className="list-disc list-inside text-gray-600 space-y-1">
                {positiveIndicators.map((indicator, index) => (
                  <li key={index}>{indicator}</li>
                ))}
              </ul>
            </div>
          )}

          {negativeIndicators.length > 0 && (
            <div className="ml-4">
              <h4 className="text-red-600 font-medium mb-2">Risk Factors:</h4>
              <ul className="list-disc list-inside text-gray-600 space-y-1">
                {negativeIndicators.map((indicator, index) => (
                  <li key={index}>{indicator}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Recommendations */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-800">Action Plan</h3>
          <div
            className={`ml-4 p-4 rounded-lg ${willChurn ? "bg-red-50" : "bg-green-50"}`}
          >
            <ul className="list-disc list-inside space-y-2">
              {recommendations.map((recommendation, index) => (
                <li
                  key={index}
                  className={willChurn ? "text-red-700" : "text-green-700"}
                >
                  {recommendation}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Result;
