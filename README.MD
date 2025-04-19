# Customer Churn Prediction

A machine learning-based web application for predicting customer churn probability and providing actionable insights.

## Features

### User Types and Features

| Feature             | Free User | Trial Gold | Premium  |
| ------------------- | --------- | ---------- | -------- |
| Single Predictions  | ✓         | ✓          | ✓        |
| Auto Save           | ✓         | Optional   | Optional |
| Save Control        | ✗         | ✓          | ✓        |
| Batch Predictions   | ✗         | ✓          | ✓        |
| Batch History       | ✗         | ✓          | ✓        |
| Prediction Settings | ✗         | ✓          | ✓        |

### Key Features

- **Single Customer Prediction**: Analyze individual customer data for churn risk assessment
- **Batch Processing**: Upload CSV files for bulk customer analysis (Premium feature)
- **Detailed Analytics**: Comprehensive risk analysis and customer behavior insights
- **Action Plans**: Customized recommendations for customer retention
- **History Management**: Track and manage prediction history with flexible save options
- **Data Visualization**: Interactive charts and graphs for better insights

## Getting Started

### Prerequisites

- Node.js (v14 or higher)
- npm or yarn
- Firebase account
- Modern web browser

### Installation

1. Clone the repository:

```bash
git clone https://github.com/yourusername/customer-churn-prediction.git
cd customer-churn-prediction
```

2. Install dependencies:

```bash
npm install
# or
yarn install
```

3. Set up environment variables:
   Create a `.env` file in the root directory and add your Firebase configuration:

```env
REACT_APP_FIREBASE_API_KEY=your_api_key
REACT_APP_FIREBASE_AUTH_DOMAIN=your_auth_domain
REACT_APP_FIREBASE_PROJECT_ID=your_project_id
REACT_APP_FIREBASE_STORAGE_BUCKET=your_storage_bucket
REACT_APP_FIREBASE_MESSAGING_SENDER_ID=your_messaging_sender_id
REACT_APP_FIREBASE_APP_ID=your_app_id
```

4. Start the development server:

```bash
npm start
# or
yarn start
```

## Usage

1. **Single Prediction**:

   - Enter customer details in the prediction form
   - Get instant churn probability and recommendations
   - Save or auto-save results based on your subscription

2. **Batch Prediction**:

   - Upload CSV file with customer data
   - Get bulk analysis and insights
   - Download or save results for future reference

3. **History Management**:
   - View past predictions
   - Filter and sort results
   - Access detailed analysis for each prediction

## Technologies Used

- React.js
- Firebase (Authentication & Firestore)
- TailwindCSS
- Machine Learning Model (Python backend)
- Chart.js for visualizations

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Contact

Your Name - [@yourtwitter](https://twitter.com/yourtwitter)
Project Link: [https://github.com/yourusername/customer-churn-prediction](https://github.com/yourusername/customer-churn-prediction)
