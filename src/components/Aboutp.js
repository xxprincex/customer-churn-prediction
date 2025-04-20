import { PIC1 } from "../utils/constants";
import { PIC2 } from "../utils/constants";
import { PIC3 } from "../utils/constants";
import { FaChartLine, FaUsers, FaRobot, FaCheckCircle } from "react-icons/fa";

const Aboutp = () => {
  const features = [
    {
      icon: <FaChartLine className="text-4xl text-[#1d5a7b]" />,
      title: "Advanced Analytics",
      description:
        "Uses machine learning to analyze customer behavior patterns and predict potential churn risks.",
    },
    {
      icon: <FaUsers className="text-4xl text-[#1d5a7b]" />,
      title: "Customer Insights",
      description:
        "Provides detailed customer profiles and engagement metrics to understand customer needs better.",
    },
    {
      icon: <FaRobot className="text-4xl text-[#1d5a7b]" />,
      title: "AI-Powered Predictions",
      description:
        "Utilizes artificial intelligence to forecast customer churn probability with high accuracy.",
    },
    {
      icon: <FaCheckCircle className="text-4xl text-[#1d5a7b]" />,
      title: "Actionable Results",
      description:
        "Delivers clear, actionable insights to help retain customers and improve satisfaction.",
    },
  ];

  return (
    <div className="pt-40 bg-white relative z-0">
      <div className="max-w-7xl mx-auto px-4 space-y-24">
        <div className="text-center">
          <h2 className="text-4xl font-bold text-[#1d5a7b] mb-6">
            Intelligent Churn Prevention Platform
          </h2>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto leading-relaxed">
            Our AI-powered platform helps businesses predict and prevent
            customer churn by analyzing behavioral patterns and engagement
            metrics.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
          {features.map((feature, index) => (
            <div
              key={index}
              className="bg-gray-50 p-8 rounded-2xl shadow-sm hover:shadow-lg transition-all duration-300
                transform hover:-translate-y-1 border border-gray-100"
            >
              <div className="mb-4">{feature.icon}</div>
              <h3 className="text-xl font-semibold mb-2">{feature.title}</h3>
              <p className="text-gray-600">{feature.description}</p>
            </div>
          ))}
        </div>

        {/* What is Customer Churn */}
        <div className="flex flex-col md:flex-row items-center gap-16 bg-gray-50 p-12 rounded-2xl">
          <div className="md:w-1/2">
            <h3 className="text-2xl font-bold text-[#1d5a7b] mb-6">
              What is Customer Churn?
            </h3>
            <p className="text-lg text-gray-600 mb-4">
              Customer churn prediction is a proactive approach to identify
              customers who are likely to discontinue using your products or
              services. By analyzing various factors such as:
            </p>
            <ul className="list-disc list-inside text-gray-600 space-y-2">
              <li>Purchase history and frequency</li>
              <li>Customer satisfaction scores</li>
              <li>Engagement levels and interaction patterns</li>
              <li>Product usage and preferences</li>
              <li>Customer service interactions</li>
            </ul>
          </div>
          <div className="md:w-1/2">
            <img
              src={PIC1}
              alt="Data Analysis"
              className="rounded-2xl shadow-lg transform hover:scale-105 transition-transform duration-500"
            />
          </div>
        </div>

        {/* How It Works */}
        <div className="flex flex-col md:flex-row-reverse items-center gap-16">
          <div className="md:w-1/2">
            <h3 className="text-2xl font-bold text-[#1d5a7b] mb-6">
              How It Works
            </h3>
            <div className="space-y-4">
              <div className="flex items-start">
                <span className="flex-shrink-0 w-8 h-8 bg-[#1d5a7b] text-white rounded-full flex items-center justify-center mr-4">
                  1
                </span>
                <div>
                  <h4 className="font-semibold mb-2">Data Collection</h4>
                  <p className="text-gray-600">
                    Gather and analyze customer interaction data across multiple
                    touchpoints
                  </p>
                </div>
              </div>
              <div className="flex items-start">
                <span className="flex-shrink-0 w-8 h-8 bg-[#1d5a7b] text-white rounded-full flex items-center justify-center mr-4">
                  2
                </span>
                <div>
                  <h4 className="font-semibold mb-2">Pattern Recognition</h4>
                  <p className="text-gray-600">
                    Identify behavior patterns that indicate potential churn
                    risk
                  </p>
                </div>
              </div>
              <div className="flex items-start">
                <span className="flex-shrink-0 w-8 h-8 bg-[#1d5a7b] text-white rounded-full flex items-center justify-center mr-4">
                  3
                </span>
                <div>
                  <h4 className="font-semibold mb-2">Risk Assessment</h4>
                  <p className="text-gray-600">
                    Calculate churn probability and categorize risk levels
                  </p>
                </div>
              </div>
            </div>
          </div>
          <div className="md:w-1/2">
            <img
              src={PIC2}
              alt="Process Visualization"
              className="rounded-2xl shadow-lg transform hover:scale-105 transition-transform duration-500"
            />
          </div>
        </div>

        {/* Benefits Section */}
        <div className="flex flex-col md:flex-row items-center gap-16 bg-gray-50 p-12 rounded-2xl">
          <div className="md:w-1/2">
            <h3 className="text-2xl font-bold text-[#1d5a7b] mb-6">
              Business Benefits
            </h3>
            <div className="space-y-6">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-12 h-12 bg-[#1d5a7b] rounded-full flex items-center justify-center text-white">
                  1
                </div>
                <div>
                  <h4 className="font-semibold mb-2">
                    Increased Customer Retention
                  </h4>
                  <p className="text-gray-600">
                    Identify at-risk customers early and take proactive measures
                    to retain them.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-12 h-12 bg-[#1d5a7b] rounded-full flex items-center justify-center text-white">
                  2
                </div>
                <div>
                  <h4 className="font-semibold mb-2">Cost Reduction</h4>
                  <p className="text-gray-600">
                    Lower customer acquisition costs by focusing on retention
                    strategies.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-12 h-12 bg-[#1d5a7b] rounded-full flex items-center justify-center text-white">
                  3
                </div>
                <div>
                  <h4 className="font-semibold mb-2">Revenue Growth</h4>
                  <p className="text-gray-600">
                    Maintain and grow revenue by preventing customer churn.
                  </p>
                </div>
              </div>
            </div>
          </div>
          <div className="md:w-1/2">
            <img
              src={PIC3}
              alt="Benefits Visualization"
              className="rounded-2xl shadow-lg transform hover:scale-105 transition-transform duration-500"
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default Aboutp;
