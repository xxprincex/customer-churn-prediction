# Customer Churn Prediction Dashboard

A React-based admin dashboard for visualizing and analyzing customer churn predictions.

## Features

- Upload and analyze CSV data for customer churn predictions
- Interactive visualizations including:
  - Confidence Score Distribution
  - Risk Timeline Analysis
  - Detailed Customer Data
- Save visualization as images
- Responsive design for all screen sizes

## Setup Instructions

1. Clone the repository
2. Install dependencies:

   ```bash
   npm install
   ```

3. Configure Firebase:

   - Create a Firebase project at [Firebase Console](https://console.firebase.google.com)
   - Copy your Firebase configuration
   - Create a `.env` file in the root directory
   - Update the `.env` file with your Firebase credentials

4. Start the development server:

   ```bash
   npm start
   ```

5. Build for production:
   ```bash
   npm run build
   ```

## Environment Variables

Create a `.env` file in the root directory with the following variables:

```
REACT_APP_FIREBASE_API_KEY=your_api_key_here
REACT_APP_FIREBASE_AUTH_DOMAIN=your_auth_domain_here
REACT_APP_FIREBASE_PROJECT_ID=your_project_id_here
REACT_APP_FIREBASE_STORAGE_BUCKET=your_storage_bucket_here
REACT_APP_FIREBASE_MESSAGING_SENDER_ID=your_messaging_sender_id_here
REACT_APP_FIREBASE_APP_ID=your_app_id_here
```

## Project Structure

```

├── src/
│   ├── components/
│   │   ├── CsvResults.js
│   │   ├── CsvUpload.js
│   │   └── PredictionDetail.js
│   ├── App.js
│   └── index.js
├── .env
├── package.json
└── index.html

```

## Dependencies

- React
- Firebase
- html2canvas
- Other UI libraries

## Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a new Pull Request
