import pickle
import numpy as np
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import pandas as pd
from sklearn.preprocessing import LabelEncoder, MinMaxScaler, StandardScaler
import joblib
import time
import stripe
import firebase_admin
from firebase_admin import credentials, firestore
import os
from datetime import datetime, timedelta
from dotenv import load_dotenv
import json

load_dotenv()

STRIPE_API_KEY = os.getenv("STRIPE_API_KEY")
STRIPE_WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET")

app = Flask(__name__, static_folder='dist', static_url_path='')

# Configure CORS
CORS(app)

# Initialize Firebase Admin
try:
    firebase_config = os.getenv('FIREBASE_CONFIG')
    if firebase_config:
        try:
            cred_dict = json.loads(firebase_config)
            cred = credentials.Certificate(cred_dict)
            firebase_admin.initialize_app(cred)
        except json.JSONDecodeError as e:
            print(f"Error parsing Firebase config: {e}")
            print("Please check your FIREBASE_CONFIG environment variable format")
            # Initialize with default credentials if available
            try:
                firebase_admin.initialize_app()
            except ValueError as e:
                print(f"Error initializing Firebase: {e}")
    else:
        print("Warning: FIREBASE_CONFIG environment variable not set")
        # Initialize with default credentials if available
        try:
            firebase_admin.initialize_app()
        except ValueError as e:
            print(f"Error initializing Firebase: {e}")
except Exception as e:
    print(f"Error during Firebase initialization: {e}")

# Initialize Firestore
try:
    db = firestore.client()
except Exception as e:
    print(f"Error initializing Firestore: {e}")
    db = None

# Initialize Stripe
stripe.api_key = STRIPE_API_KEY
endpoint_secret = STRIPE_WEBHOOK_SECRET

# Load the trained model
with open('model_classifier.pkl', 'rb') as f:
    model = pickle.load(f)

# Create a scaler for feature normalization
scaler = MinMaxScaler()
# Fit the scaler with a reasonable range for each feature to ensure consistent scaling
sample_data = np.array([
    [0, 0, 1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0],  # Min values
    [30, 2, 3, 40, 6, 1, 10, 10, 4, 5, 2, 15, 1, 30, 20, 30, 30, 300]   # Max values
])
scaler.fit(sample_data)  # Pre-fit the scaler with expected min/max ranges

# Define categorical columns that need encoding
categorical_columns = [
    'PreferredLoginDevice', 
    'PreferredPaymentMode', 
    'Gender',
    'PreferedOrderCat', 
    'MaritalStatus'
]

# Define all feature columns in the correct order
feature_columns = [
    'Tenure', 'PreferredLoginDevice', 'CityTier', 'WarehouseToHome',
    'PreferredPaymentMode', 'Gender', 'HourSpendOnApp', 'NumberOfDeviceRegistered',
    'PreferedOrderCat', 'SatisfactionScore', 'MaritalStatus', 'NumberOfAddress',
    'Complain', 'OrderAmountHikeFromlastYear', 'CouponUsed', 'OrderCount',
    'DaySinceLastOrder', 'CashbackAmount'
]

# Create label encoders for categorical features
label_encoders = {}
for column in categorical_columns:
    label_encoders[column] = LabelEncoder()

# Define mappings for categorical variables based on the training data
label_encoders['PreferredLoginDevice'].fit(['Mobile Phone', 'Tablet Phone', 'Computer'])
label_encoders['PreferredPaymentMode'].fit([ 'Debit Card', 'UPI', 'E wallet', 'Cash on Delivery', 'Credit Card'])
label_encoders['Gender'].fit(['Male', 'Female'])
label_encoders['PreferedOrderCat'].fit(['Laptop & Accessory', 'Mobile Phone', 'Fashion', 'Grocery', 'Others', 'Mobile'])
label_encoders['MaritalStatus'].fit(['Single', 'Married', 'Divorced'])

def adjust_probability(churn_prob, data):
    """Adjust churn probability based on comprehensive risk analysis"""
    
    # Initialize risk tracking
    risk_score = 0
    risk_factors = []
    positive_factors = []
    
    # 1. Critical Risk Factors (Heavy weight: ±0.15 each)
    if int(data.get('Complain', 0)) > 0:
        risk_score += 3
        risk_factors.append("Has filed complaints")
    
    if float(data.get('SatisfactionScore', 5)) <= 2:
        risk_score += 3
        risk_factors.append("Very low satisfaction score")
    elif float(data.get('SatisfactionScore', 5)) >= 4:
        risk_score -= 3
        positive_factors.append("High satisfaction score")
    
    # 2. Engagement Factors (Medium weight: ±0.1 each)
    # Tenure analysis
    tenure = int(data.get('Tenure', 0))
    if tenure < 3:
        risk_score += 2
        risk_factors.append("Very short tenure")
    elif tenure > 12:
        risk_score -= 2
        positive_factors.append("Long-term customer")
    
    # Order patterns
    order_count = int(data.get('OrderCount', 0))
    if order_count <= 2:
        risk_score += 2
        risk_factors.append("Low order count")
    elif order_count >= 5:
        risk_score -= 2
        positive_factors.append("Regular ordering pattern")
    
    # Recent activity
    days_since_order = int(data.get('DaySinceLastOrder', 0))
    if days_since_order > 30:
        risk_score += 2
        risk_factors.append("Long time since last order")
    elif days_since_order <= 7:
        risk_score -= 2
        positive_factors.append("Recently active")
    
    # 3. Platform Engagement (Light weight: ±0.05 each)
    devices = int(data.get('NumberOfDeviceRegistered', 0))
    if devices >= 3:
        risk_score -= 1
        positive_factors.append("Multi-device engagement")
    
    hours_on_app = float(data.get('HourSpendOnApp', 0))
    if hours_on_app >= 3:
        risk_score -= 1
        positive_factors.append("High app engagement")
    elif hours_on_app < 1:
        risk_score += 1
        risk_factors.append("Low app engagement")
    
    # 4. Value and Growth Indicators
    order_hike = float(data.get('OrderAmountHikeFromlastYear', 0))
    if order_hike > 15:
        risk_score -= 1
        positive_factors.append("Strong order value growth")
    elif order_hike < 5:
        risk_score += 1
        risk_factors.append("Declining order value")
    
    coupon_usage = int(data.get('CouponUsed', 0))
    if coupon_usage >= 5:
        risk_score -= 1
        positive_factors.append("Active promotion participant")
    
    # 5. Demographic/Geographic Factors
    city_tier = int(data.get('CityTier', 1))
    if city_tier == 3 and tenure < 6:
        risk_score += 1
        risk_factors.append("New customer in Tier 3 city")
    
    # Calculate final adjustment
    # Each point is worth 5% adjustment
    adjustment = 1.0 + (risk_score * 0.05)
    
    # Ensure probability stays within valid range
    adjusted_prob = max(0.0, min(1.0, churn_prob * adjustment))
    
    # Sort factors by importance (critical first)
    risk_factors.sort(key=lambda x: len(x), reverse=True)
    positive_factors.sort(key=lambda x: len(x), reverse=True)
    
    # Combine all factors, with risk factors first
    all_factors = risk_factors + positive_factors
    
    return adjusted_prob, all_factors

def clean_numeric_value(value, default=0):
    """Clean and validate numeric values"""
    if value is None or value == '':
        return default
    try:
        return float(value)
    except (ValueError, TypeError):
        return default

@app.route('/predict', methods=['POST'])
def predict():
    try:
        # Get data from request
        data = request.json
        
        # Convert to DataFrame with a single row
        input_df = pd.DataFrame([data])
        
        # Convert string values to appropriate types and validate ranges
        for col in input_df.columns:
            if col in ['CityTier', 'Complain']:
                input_df[col] = input_df[col].astype(int)
                # Validate CityTier (should be 1, 2, or 3)
                if col == 'CityTier' and input_df[col].values[0] not in [1, 2, 3]:
                    return jsonify({"error": f"Invalid value for CityTier: must be 1, 2, or 3"}), 400
                # Validate Complain (should be 0 or 1)
                if col == 'Complain' and input_df[col].values[0] not in [0, 1]:
                    return jsonify({"error": f"Invalid value for Complain Status: must be No Complain  or Has Complain"}), 400
            elif col not in categorical_columns:
                input_df[col] = input_df[col].astype(float)
                # Validate numerical ranges to prevent extreme values
                if col == 'Tenure' and (input_df[col].values[0] < 0 or input_df[col].values[0] > 61):
                    return jsonify({"error": f"Invalid value for Tenure: must be between 0 months and 61 months"}), 400
                if col == 'SatisfactionScore' and (input_df[col].values[0] < 1 or input_df[col].values[0] > 5):
                    return jsonify({"error": f"Invalid value for SatisfactionScore: must be between 1 and 5"}), 400
        
        # Encode categorical variables
        for column in categorical_columns:
            if column in input_df.columns:
                try:
                    input_df[column] = label_encoders[column].transform(input_df[column])
                except ValueError as e:
                    return jsonify({"error": f"Invalid value for {column}: {str(e)}"}), 400
        
        # Ensure all required features are present and in correct order
        features = np.zeros(len(feature_columns))
        for i, feature in enumerate(feature_columns):
            if feature in input_df.columns:
                features[i] = input_df[feature].values[0]
        
        # Scale features using MinMaxScaler to match training data
        features_reshaped = features.reshape(1, -1)
        features_scaled = scaler.transform(features_reshaped)  # Use transform instead of fit_transform
        
        # Make prediction
        prediction = int(model.predict(features_scaled)[0])
        
        # Get probability scores
        proba = model.predict_proba(features_scaled)[0]
        stay_probability = float(proba[0])  # Probability of class 0 (stay)
        churn_probability = float(proba[1])  # Probability of class 1 (churn)
        
        # Apply post-prediction adjustments
        adjusted_probability, risk_factors = adjust_probability(churn_probability, data)
        
        # Final prediction based on adjusted probability
        final_prediction = 1 if adjusted_probability >= 0.5 else 0
        
        return jsonify({
            "prediction": final_prediction,
            "stay_probability": float(1 - adjusted_probability),
            "churn_probability": float(adjusted_probability),
            "prediction_label": "Likely to Churn" if final_prediction == 1 else "Likely to Stay",
            "risk_factors": risk_factors
        })
    
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/webhook', methods=['POST'])
def webhook():
    if not endpoint_secret:
        print("Warning: Stripe webhook secret is not set!")
        return jsonify({'error': 'Stripe webhook secret is not configured'}), 500

    event = None
    payload = request.data
    sig_header = request.headers.get('Stripe-Signature')

    if not sig_header:
        return jsonify({'error': 'No Stripe signature header'}), 400

    try:
        event = stripe.Webhook.construct_event(
            payload, sig_header, endpoint_secret
        )
    except ValueError as e:
        print("Invalid payload:", e)
        return jsonify({'error': 'Invalid payload'}), 400
    except stripe.error.SignatureVerificationError as e:
        print("Invalid signature:", e)
        return jsonify({'error': 'Invalid signature'}), 400
    except Exception as e:
        print("Unexpected error:", e)
        return jsonify({'error': 'Unexpected error processing webhook'}), 500

    # Handle the checkout.session.completed event
    if event['type'] == 'checkout.session.completed':
        try:
            session = event['data']['object']
            print(f"Processing completed checkout session: {session.get('id')}")
            
            # Get customer email from the session
            customer_email = session.get('customer_details', {}).get('email')
            print(f"Customer email from session: {customer_email}")
            
            if not customer_email:
                print("No customer email found in session.")
                return jsonify({'error': 'No customer email in session'}), 400

            # Query Firestore with timeout and retry
            users_ref = db.collection('Users')
            MAX_RETRIES = 3
            TIMEOUT = 30  # 30 seconds timeout

            for attempt in range(MAX_RETRIES):
                try:
                    # Get all users to debug
                    print("Querying all users in Users collection...")
                    all_users = list(users_ref.stream())
                    print(f"Total users found: {len(all_users)}")
                    for user in all_users:
                        print(f"Found user: {user.id} with data: {user.to_dict()}")

                    # Query for specific user
                    query = users_ref.where('email', '==', customer_email)
                    user_docs = list(query.stream())
                    print(f"Number of matching users found: {len(user_docs)}")

                    if not user_docs:
                        print(f"No user found with email: {customer_email}")
                        return jsonify({'error': 'User not found'}), 404

                    if len(user_docs) > 1:
                        print(f"Warning: Multiple users found with email: {customer_email}")

                    for user_doc in user_docs:
                        print(f"Updating user doc: {user_doc.id}")
                        now = datetime.now()
                        subscription_end = now + timedelta(days=30)
                        
                        update_data = {
                            'subscriptionPlan': 'gold',
                            'trialUsed': True,
                            'trialEndDate': None,
                            'trialStartDate': None,
                            'subscriptionStartDate': now,
                            'subscriptionEndDate': subscription_end,
                            'lastUpdated': now,
                            'stripeSessionId': session.get('id')
                        }

                        # Update document directly without transaction
                        # (Firestore transactions are atomic by default for single documents)
                        user_doc.reference.update(update_data)
                        print(f"Successfully updated user: {user_doc.id}")
                        return jsonify({'status': 'success', 'message': 'Subscription updated'}), 200

                    break  # Success, exit retry loop
                except Exception as e:
                    print(f"Attempt {attempt + 1} failed: {str(e)}")
                    if attempt == MAX_RETRIES - 1:  # Last attempt
                        raise
                    time.sleep(2 ** attempt)  # Exponential backoff

        except Exception as e:
            print(f"Error processing checkout session: {str(e)}")
            return jsonify({'error': f'Error processing checkout: {str(e)}'}), 500

    return jsonify({'status': 'success', 'message': 'Event received'}), 200

def validate_and_clean_record(record, customer_id):
    """Validate and clean a single record"""
    try:
        cleaned_record = {}
        
        # Validate and clean numeric fields
        numeric_fields = {
            'Tenure': {'min': 0, 'max': 61},
            'CityTier': {'min': 1, 'max': 3},
            'WarehouseToHome': {'min': 0, 'max': 100},
            'HourSpendOnApp': {'min': 0, 'max': 24},
            'NumberOfDeviceRegistered': {'min': 0, 'max': 10},
            'SatisfactionScore': {'min': 1, 'max': 5},
            'NumberOfAddress': {'min': 0, 'max': 50},
            'Complain': {'min': 0, 'max': 1},
            'OrderAmountHikeFromlastYear': {'min': 0, 'max': 100},
            'CouponUsed': {'min': 0, 'max': 100},
            'OrderCount': {'min': 0, 'max': 100},
            'DaySinceLastOrder': {'min': 0, 'max': 365},
            'CashbackAmount': {'min': 0, 'max': 1000}
        }
        
        for field, limits in numeric_fields.items():
            value = clean_numeric_value(record.get(field))
            if value < limits['min'] or value > limits['max']:
                return {
                    'has_error': True,
                    'error_message': f"Invalid value for {field}: must be between {limits['min']} and {limits['max']}"
                }
            cleaned_record[field] = value
            
        # Validate and clean categorical fields
        categorical_fields = {
            'PreferredLoginDevice': ['Mobile Phone', 'Tablet Phone', 'Computer'],
            'PreferredPaymentMode': ['Debit Card', 'UPI', 'E wallet', 'Cash on Delivery', 'Credit Card'],
            'Gender': ['Male', 'Female'],
            'PreferedOrderCat': ['Laptop & Accessory', 'Mobile Phone', 'Fashion', 'Grocery', 'Others', 'Mobile'],
            'MaritalStatus': ['Single', 'Married', 'Divorced']
        }
        
        for field, valid_values in categorical_fields.items():
            value = record.get(field)
            if value not in valid_values:
                return {
                    'has_error': True,
                    'error_message': f"Invalid value for {field}: must be one of {', '.join(valid_values)}"
                }
            cleaned_record[field] = value
            
        return cleaned_record
        
    except Exception as e:
        return {
            'has_error': True,
            'error_message': f"Error processing record for customer {customer_id}: {str(e)}"
        }

def get_risk_factors(record):
    """Get risk factors for a customer record"""
    risk_factors = []
    
    if int(record.get('DaySinceLastOrder', 0)) > 14:
        risk_factors.append("Inactive for more than 2 weeks")
    if int(record.get('Tenure', 0)) < 6:
        risk_factors.append("New customer (less than 6 months)")
    if int(record.get('Complain', 0)) > 0:
        risk_factors.append("Has complaints")
    if float(record.get('SatisfactionScore', 5)) <= 3:
        risk_factors.append("Low satisfaction score")
    if int(record.get('OrderCount', 0)) < 2:
        risk_factors.append("Low order count")
    
    return risk_factors

def prepare_features(record):
    """Prepare features for prediction"""
    features = []
    for column in feature_columns:
        if column in categorical_columns:
            # Encode categorical variables
            value = label_encoders[column].transform([record[column]])[0]
        else:
            # Use numeric values directly
            value = record[column]
        features.append(value)
    
    # Scale features
    features = np.array(features).reshape(1, -1)
    return scaler.transform(features)[0]

@app.route('/predict-batch', methods=['POST'])
def predict_batch():
    try:
        request_data = request.get_json()
        
        # Validate request data
        if not request_data:
            return jsonify({"error": "No data provided"}), 400
            
        data = request_data.get('data', [])
        customer_ids = request_data.get('customerIds', [])
        
        # Validate batch size
        if len(data) > 1000:  # Maximum 1000 records per batch
            return jsonify({"error": "Batch size exceeds maximum limit of 1000 records"}), 400
            
        if len(data) == 0:
            return jsonify({"error": "Empty batch provided"}), 400

        # Process each record
        predictions = []
        errors = []
        
        for idx, record in enumerate(data):
            try:
                # Extract customer ID
                customer_id = customer_ids[idx] if idx < len(customer_ids) else f'generated_{idx}'
                
                # Validate and clean record
                cleaned_record = validate_and_clean_record(record, customer_id)
                if isinstance(cleaned_record, dict) and cleaned_record.get('has_error'):
                    errors.append({
                        'customerID': customer_id,
                        'error': cleaned_record.get('error_message'),
                        'index': idx
                    })
                    continue

                # Prepare features and make prediction
                features = prepare_features(cleaned_record)
                prediction = model.predict_proba([features])[0]
                churn_probability = float(prediction[1])
                
                # Adjust probability based on risk factors
                adjusted_probability, risk_factors = adjust_probability(churn_probability, cleaned_record)
                
                # Create prediction result
                prediction_result = {
                    'customerID': customer_id,
                    'prediction': 1 if adjusted_probability >= 0.5 else 0,
                    'churnProbability': adjusted_probability,
                    'stayProbability': 1 - adjusted_probability,
                    'predictionLabel': "Likely to Churn" if adjusted_probability >= 0.5 else "Likely to Stay",
                    'confidenceScore': max(adjusted_probability, 1 - adjusted_probability),
                    'riskFactors': risk_factors
                }
                
                predictions.append(prediction_result)
                
            except Exception as e:
                errors.append({
                    'customerID': customer_id,
                    'error': str(e),
                    'index': idx
                })

        # Return results
        response = {
            'predictions': predictions,
            'errors': errors,
            'summary': {
                'total': len(data),
                'successful': len(predictions),
                'failed': len(errors)
            }
        }
        
        return jsonify(response)
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# Serve static files from the React app
@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def serve(path):
    if path and os.path.exists(app.static_folder + '/' + path):
        return send_from_directory(app.static_folder, path)
    else:
        return send_from_directory(app.static_folder, 'index.html')

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 10000))
    app.run(host='0.0.0.0', port=port, debug=False)